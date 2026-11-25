"""Bounded public GitHub snapshots. Source positions survive prompt truncation."""

import base64
import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import quote

from .github_client import GitHubProviderError

NAME = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def material_digest(snapshot) -> str:
    # A code-only commit changes the permalink, not the material the model read.
    return digest(
        {
            "repo_id": snapshot["repo_id"],
            "name": snapshot["name"],
            "documents": [
                {
                    key: value
                    for key, value in doc.items()
                    if key not in {"url", "commit"}
                }
                for doc in snapshot["documents"]
            ],
        }
    )


def collect_snapshot(name, fetch):
    if not NAME.fullmatch(name) or any(part in {".", ".."} for part in name.split("/")):
        raise ValueError("Invalid repository name")
    path = "/repos/" + name
    item = fetch(path)
    if item.get("private"):
        raise ValueError("Only public repositories are supported")
    name = item["full_name"]
    repo_id = str(item["id"])
    documents, warnings = [], []
    if item.get("description"):
        documents.append(
            {
                "id": repo_id + ":description",
                "kind": "description",
                "url": f"https://github.com/{name}",
                "text": item["description"],
                "start_line": 1,
            }
        )
    try:
        commit = fetch(
            path + "/commits/" + quote(item.get("default_branch", "HEAD"), safe="")
        )["sha"]
        readme = fetch(path + "/readme", {"ref": commit})
        if readme.get("encoding") != "base64" or readme.get("size", 0) > 1_000_000:
            raise ValueError("README too large or not base64")
        content = base64.b64decode(readme.get("content", ""), validate=False).decode(
            "utf-8", errors="replace"
        )
        lines = content.splitlines(keepends=True)
        # Keep whole lines and original positions; avoid pretending omitted text was read.
        head, count = [], 0
        for line in lines:
            if count + len(line) > 16000:
                break
            head.append(line)
            count += len(line)
        ranges = [(0, len(head))]
        if len(head) < len(lines):
            tail, size = len(lines), 0
            while tail > len(head) and size + len(lines[tail - 1]) <= 8000:
                tail -= 1
                size += len(lines[tail])
            ranges.append((tail, len(lines)))
            warnings.append(
                "README 超出阅读预算，仅保留开头与结尾；未读取部分不能用于判断。"
            )
        revision = readme.get("sha", "")
        file = quote(readme.get("path", "README.md"), safe="/")
        url = f"https://github.com/{name}/blob/{commit}/{file}"
        for index, (start, end) in enumerate(ranges):
            text = "".join(lines[start:end])
            if text.strip():
                documents.append(
                    {
                        "id": f"{repo_id}:readme:{index}",
                        "kind": "readme",
                        "url": url,
                        "text": text,
                        "start_line": start + 1,
                        "path": readme.get("path"),
                        "blob_sha": revision,
                        "commit": commit,
                    }
                )
    except (GitHubProviderError, OSError, ValueError):
        warnings.append("README 不可用；当前仅有仓库描述，不能据此断言内部机制。")
    stable = {"repo_id": repo_id, "name": name, "documents": documents}
    return {**stable, "hash": digest(stable), "fetched_at": now(), "warnings": warnings}
