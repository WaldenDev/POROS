from __future__ import annotations
import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from .config import get_settings

class GitHubProviderError(RuntimeError):
    pass

class GitHubClient:
    def __init__(self) -> None:
        self.token = get_settings().github_token

    @property
    def token_present(self) -> bool:
        return bool(self.token)

    def request_json(self, path: str, params: dict[str, str | int] | None = None, timeout: int | None = None) -> Any:
        url = f"https://api.github.com{path}"
        if params:
            url = f"{url}?{urlencode(params)}"
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "POROS-local-dev",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(url, headers=headers)
        try:
            request_timeout = timeout or get_settings().github_request_timeout_seconds
            with urlopen(request, timeout=request_timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise GitHubProviderError(f"GitHub API returned {exc.code}: {detail[:300]}") from exc
        except URLError as exc:
            raise GitHubProviderError(f"GitHub API request failed: {exc.reason}") from exc
        except TimeoutError as exc:
            raise GitHubProviderError("GitHub API request timed out") from exc
