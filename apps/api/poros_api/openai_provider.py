"""OpenAI-compatible Chat Completions transport; no business prompts live here."""

import json
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .config import env_bool, env_int, env_value, get_settings
from .llm_contracts import LLMProviderError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a bearer token to a redirect target.
        return None


def configuration() -> tuple[str, str, str]:
    get_settings()
    base = (env_value("POROS_OPENAI_BASE_URL", "") or "").strip().rstrip("/")
    key = (env_value("POROS_OPENAI_API_KEY", "") or "").strip()
    model = (env_value("POROS_OPENAI_MODEL", "") or "").strip()
    if not all((base, key, model)):
        raise LLMProviderError("Set POROS_OPENAI_BASE_URL, POROS_OPENAI_API_KEY and POROS_OPENAI_MODEL in apps/api/.env.")
    try:
        parsed = urlsplit(base)
        parsed.port
    except ValueError:
        raise LLMProviderError("Base URL is invalid; check host and port.") from None
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query
            or parsed.fragment or not (parsed.scheme == "https" or (local and parsed.scheme == "http"))):
        raise LLMProviderError("Base URL must use HTTPS (HTTP is allowed only on loopback), without credentials, query or fragment.")
    if parsed.path.endswith("/chat/completions"):
        raise LLMProviderError("Set the API base URL, without /chat/completions.")
    if any(char in key for char in "\r\n"):
        raise LLMProviderError("API key contains an invalid newline.")
    return base, key, model


def request_openai_json(system: str, prompt: str) -> dict:
    base, key, model = configuration()
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system + "\nReturn one JSON object only, without markdown fences."},
            {"role": "user", "content": prompt},
        ],
    }
    if env_bool("POROS_OPENAI_JSON_MODE", True):
        body["response_format"] = {"type": "json_object"}
    request = Request(base + "/chat/completions", data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + key,
    })
    try:
        with build_opener(NoRedirect()).open(
            request, timeout=env_int("POROS_OPENAI_TIMEOUT_SECONDS", 90, 5, 300)
        ) as response:
            payload = json.load(response)
    except HTTPError as exc:
        hints = {401: "check API key", 403: "check model permissions", 404: "check base URL and model",
                 429: "check quota or rate limit", 400: "check model and JSON mode support"}
        raise LLMProviderError(f"Model API HTTP {exc.code}: {hints.get(exc.code, 'check provider availability')}.") from None
    except (OSError, ValueError):
        raise LLMProviderError("Model API unavailable or invalid response; check network, timeout and base URL.") from None
    try:
        choice = payload["choices"][0]
        if choice.get("finish_reason") not in (None, "stop"):
            raise ValueError("Incomplete completion")
        result = json.loads(choice["message"]["content"])
        if not isinstance(result, dict):
            raise ValueError("Not a JSON object")
        return result
    except (KeyError, IndexError, TypeError, ValueError):
        raise LLMProviderError("Model returned empty, incomplete or invalid JSON; use a JSON-capable chat model.") from None
