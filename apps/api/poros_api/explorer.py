"""Independent repository exploration; no profile or idea-generation dependency."""

from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic
from urllib.parse import quote
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .github_client import GitHubClient, GitHubProviderError
from .expansion_contracts import ExpansionRequest
from .explorer_expansion import expand_repository, repo_path
from .atlas_contracts import MAX_REPOS
from .explorer_filters import SearchFilters, apply_filters, matches_filters
from .llm import llm_available

router = APIRouter(prefix="/api/explore")
_cache: dict = {}
_lock = Lock()


class ExploreRequest(BaseModel):
    query: str = Field(default="", max_length=120)
    page: int = Field(default=1, ge=1, le=5)
    filters: SearchFilters = Field(default_factory=SearchFilters)


def cached(path, params=None):
    key = (path, tuple(sorted((params or {}).items())))
    with _lock:
        entry = _cache.get(key)
        if entry and monotonic() - entry[0] < 300:
            return entry[1]
    value = GitHubClient().request_json(path, params)
    with _lock:
        if len(_cache) >= 128:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (monotonic(), value)
    return value


def normalize(item):
    return {
        "id": str(item["id"]),
        "name": item["full_name"],
        "url": item["html_url"],
        "description": item.get("description") or "",
        "stars": item.get("stargazers_count", 0),
        "language": item.get("language") or "Other",
        "topics": item.get("topics", [])[:6],
        "updated": item.get("pushed_at"),
        "avatar": item.get("owner", {}).get("avatar_url", ""),
    }


def explore(payload: ExploreRequest):
    today = datetime.now(timezone.utc).date()
    date = (today - timedelta(days=90)).isoformat()
    recent_floor = "stars:>100" if payload.filters.min_stars is None else ""
    established_floor = "stars:>500" if payload.filters.min_stars is None else ""
    queries = (
        [(payload.query.strip() + " archived:false", "关键词匹配")]
        if payload.query.strip()
        else [
            (f"created:>{date} {recent_floor} archived:false", "近期创建"),
            (f"topic:developer-tools {established_floor} archived:false", "开发工具"),
            (f"topic:self-hosted {established_floor} archived:false", "自托管生态"),
        ]
    )
    nodes, edges, warnings, lanes = {}, [], [], []
    for query, reason in queries:
        query = apply_filters(query + " is:public", payload.filters, today)
        try:
            result = cached(
                "/search/repositories",
                {
                    "q": query,
                    "per_page": 12,
                    "page": payload.page,
                    "sort": "stars" if not payload.query.strip() else "best-match",
                },
            )
            if result.get("incomplete_results"):
                warnings.append("GitHub 返回了部分匹配结果")
            lane = []
            for item in result.get("items", []):
                if (
                    item.get("private")
                    or item.get("archived")
                    or not matches_filters(item, payload.filters, today)
                ):
                    continue
                node = normalize(item)
                node["reason"] = reason
                lane.append(node)
            lanes.append(lane)
        except (GitHubProviderError, OSError):
            warnings.append(f"{reason}暂不可用，请稍后重试")
    # Keep the debugging cohort small without letting the first browse lane monopolize it.
    for index in range(12):
        for lane in lanes:
            if index < len(lane) and len(nodes) < MAX_REPOS:
                node = lane[index]
                nodes.setdefault(node["id"], node)
    if not lanes and warnings:
        raise HTTPException(502, "GitHub 检索失败，请检查令牌、网络或限流状态")
    for node in nodes.values():
        for topic in node["topics"]:
            edges.append(
                {
                    "source": node["id"],
                    "target": "topic:" + topic,
                    "kind": "github_topic",
                    "evidence_url": node["url"],
                }
            )
    return {
        "schema_version": "explore.v1",
        "analysis_available": llm_available(),
        "repos": list(nodes.values()),
        "edges": edges,
        "warnings": warnings,
        "filters": payload.filters.model_dump(),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/search")
def search(payload: ExploreRequest):
    return explore(payload)


@router.get("/repos/{owner}/{name}")
def detail(owner: str, name: str):
    try:
        item = cached(f"/repos/{quote(owner, safe='')}/{quote(name, safe='')}")
        return {
            **normalize(item),
            "license": (item.get("license") or {}).get("spdx_id"),
            "homepage": item.get("homepage"),
            "open_issues": item.get("open_issues_count", 0),
        }
    except (GitHubProviderError, OSError) as exc:
        raise HTTPException(502, "仓库详情暂不可用") from exc


@router.post("/repos/{owner}/{name}/expand")
def expand(owner: str, name: str, payload: ExpansionRequest = ExpansionRequest()):
    try:
        source = cached(repo_path(owner + "/" + name))
        if source.get("private"):
            raise HTTPException(404, "关联探索仅支持公开仓库。")
        return expand_repository(source, payload, cached, normalize)
    except (GitHubProviderError, OSError, RuntimeError) as exc:
        raise HTTPException(
            502, "关联探索暂不可用，请检查 GitHub / 模型服务后重试。"
        ) from exc
