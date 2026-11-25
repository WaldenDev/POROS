from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = ROOT / "apps" / "api" / ".env"
DEFAULT_DB_PATH = ROOT / "data" / "poros.db"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


def legacy_env_key(key: str) -> str:
    return key.replace("POROS_", "KLEOS_", 1) if key.startswith("POROS_") else key


def env_value(key: str, default: str | None = None) -> str | None:
    """Prefer the current name; accept pre-rename configuration at the boundary."""
    return os.environ.get(key, os.environ.get(legacy_env_key(key), default))


def default_db_path() -> Path:
    legacy = ROOT / "data" / "kleos.db"
    return legacy if not DEFAULT_DB_PATH.exists() and legacy.exists() else DEFAULT_DB_PATH


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    process_keys = set(os.environ)
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # A process-level setting, including its old alias, overrides the file.
        alias = legacy_env_key(key) if key.startswith("POROS_") else key.replace("KLEOS_", "POROS_", 1)
        if key and key not in process_keys and alias not in process_keys:
            os.environ.setdefault(key, value)


def env_bool(key: str, default: bool) -> bool:
    value = env_value(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(key: str, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    raw_value = env_value(key)
    try:
        value = int(raw_value) if raw_value is not None else default
    except ValueError:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


@dataclass(frozen=True)
class Settings:
    root: Path
    env_path: Path
    db_path: Path
    github_token: str
    gemini_key: str
    gemini_model: str
    default_source: str
    enable_search_enhancement: bool
    enable_requirement_guide: bool
    enable_llm_judge: bool
    enable_gemini_synthesis: bool
    github_query_limit: int
    github_metadata_candidate_limit: int
    github_evidence_repo_limit: int
    github_request_timeout_seconds: int
    gemini_timeout_seconds: int


def get_settings() -> Settings:
    load_env()
    github_token = os.environ.get("GITHUB_TOKEN", "").strip()
    gemini_key = (os.environ.get("GEMINI_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
    default_source = env_value("POROS_DEFAULT_SOURCE", "").strip()
    if default_source not in {"mock", "github"}:
        default_source = "github" if github_token else "mock"

    db_path = Path(env_value("POROS_DB_PATH") or default_db_path()).expanduser()
    if not db_path.is_absolute():
        db_path = ROOT / db_path

    return Settings(
        root=ROOT,
        env_path=ENV_PATH,
        db_path=db_path,
        github_token=github_token,
        gemini_key=gemini_key,
        gemini_model=os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL,
        default_source=default_source,
        enable_search_enhancement=env_bool("POROS_ENABLE_SEARCH_ENHANCEMENT", True),
        enable_requirement_guide=env_bool("POROS_ENABLE_REQUIREMENT_GUIDE", True),
        enable_llm_judge=env_bool("POROS_ENABLE_LLM_JUDGE", True),
        enable_gemini_synthesis=env_bool("POROS_ENABLE_GEMINI_SYNTHESIS", True),
        github_query_limit=env_int("POROS_GITHUB_QUERY_LIMIT", 5, 1, 8),
        github_metadata_candidate_limit=env_int("POROS_GITHUB_METADATA_CANDIDATE_LIMIT", 32, 4, 80),
        github_evidence_repo_limit=env_int("POROS_GITHUB_EVIDENCE_REPO_LIMIT", 4, 1, 8),
        github_request_timeout_seconds=env_int("POROS_GITHUB_REQUEST_TIMEOUT_SECONDS", 10, 3, 60),
        gemini_timeout_seconds=env_int("POROS_GEMINI_TIMEOUT_SECONDS", 28, 5, 90),
    )
