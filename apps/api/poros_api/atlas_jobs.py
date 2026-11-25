"""Bounded local background jobs; graph analysis never blocks first search results."""

from concurrent.futures import ThreadPoolExecutor
import logging
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .atlas_contracts import AtlasRequest
from .atlas_map_service import build_map
from .atlas_sources import NAME, collect_snapshot, digest
from .atlas_store import AtlasStore
from .github_client import GitHubProviderError

router = APIRouter(prefix="/api/explore/atlas")
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="poros-atlas")
_lock = Lock()
_jobs = {}


def _work(job_id, payload):
    from .explorer import cached

    def update(**values):
        with _lock:
            if values.get("stage") != _jobs[job_id].get("stage") and "stage" in values:
                _jobs[job_id]["stage_started"] = monotonic()
            if values.get("status") in {"completed", "failed"}:
                _jobs[job_id]["finished"] = monotonic()
            _jobs[job_id].update(values)

    try:
        update(status="running", stage="sources", completed=0)
        snapshots = []
        failures = []
        missing = []
        for name in payload.repositories:
            try:
                snapshot = collect_snapshot(name, cached)
                if snapshot["repo_id"] not in {item["repo_id"] for item in snapshots}:
                    snapshots.append(snapshot)
            except (GitHubProviderError, OSError, ValueError, KeyError):
                missing.append(name)
                failures.append(f"{name}: 来源暂不可用，未纳入深读。")
            update(completed=len(snapshots) + len(failures))
        if not snapshots:
            update(
                status="failed", error="项目材料读取失败，请检查 GitHub 服务后重试。"
            )
            return
        store = AtlasStore()
        result = build_map(
            snapshots,
            payload.query,
            store,
            progress=lambda stage, completed, total, preview: update(
                stage=stage, completed=completed, total=total, preview=preview
            ),
        )
        result["warnings"] = failures + result["warnings"]
        result["coverage"] = {
            "total": len(payload.repositories),
            "analyzed": len(result["understandings"]),
            "missing": missing + (result.get("coverage") or {}).get("missing", []),
        }
        if failures:
            result["status"] = "partial"
        if result["status"] == "partial":
            result["analysis_id"] = result["id"]
            result["id"] = digest(["partial-request", result, payload.repositories])
            store.save_partial(result)
        update(status="completed", stage="done", result=result, preview=None)
    except Exception as exc:
        # No provider payload or credential is exposed to the browser.
        logging.getLogger(__name__).error(
            "Atlas job %s failed (%s)", job_id, type(exc).__name__
        )
        update(
            status="failed", error="知识整理暂时失败，原始检索结果仍可使用，请重试。"
        )


@router.post("")
def start(payload: AtlasRequest):
    names = sorted(set(name.lower() for name in payload.repositories))
    if any(
        not NAME.fullmatch(name) or any(part in {".", ".."} for part in name.split("/"))
        for name in names
    ):
        raise HTTPException(422, "仓库名称需为 owner/name")
    payload.repositories = names
    key = digest([names, payload.query.strip().lower()])
    with _lock:
        for id in list(_jobs):
            if (
                _jobs[id]["status"] in {"completed", "failed"}
                and monotonic() - _jobs[id]["started"] > 3600
            ):
                del _jobs[id]
        active = [
            job for job in _jobs.values() if job["status"] in {"queued", "running"}
        ]
        for job in active:
            if job["key"] == key:
                return {"id": job["id"]}
        if len(active) >= 2:
            raise HTTPException(429, "已有两批项目正在整理，请稍后重试。")
        if len(_jobs) >= 64:
            oldest = next(
                (
                    id
                    for id, job in _jobs.items()
                    if job["status"] not in {"queued", "running"}
                ),
                None,
            )
            if oldest:
                del _jobs[oldest]
        job_id = uuid4().hex
        _jobs[job_id] = {
            "id": job_id,
            "key": key,
            "started": monotonic(),
            "stage_started": monotonic(),
            "status": "queued",
            "stage": "queued",
            "completed": 0,
            "total": len(names),
        }
    _executor.submit(_work, job_id, payload)
    return {"id": job_id}


@router.get("/jobs/{job_id}")
def job(job_id: str):
    with _lock:
        value = _jobs.get(job_id)
        if not value:
            raise HTTPException(404, "任务已过期或服务重启，请重新整理。")
        return {
            **{
                key: item
                for key, item in value.items()
                if key not in {"key", "started", "stage_started", "finished"}
            },
            "elapsed_seconds": round(
                value.get("finished", monotonic()) - value["started"]
            ),
            "stage_elapsed_seconds": round(
                value.get("finished", monotonic())
                - value.get("stage_started", value["started"])
            ),
        }


@router.get("/maps/{map_id}")
def replay(map_id: str):
    value = AtlasStore().get_map(map_id)
    if not value:
        raise HTTPException(404, "未找到完整图谱版本")
    return value


@router.get("/history/{scope}")
def history(scope: str):
    return {"revisions": AtlasStore().history(scope)}
