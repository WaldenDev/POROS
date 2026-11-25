from __future__ import annotations

import json
import re
from http.client import RemoteDisconnected
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import get_settings


from .llm_contracts import LLMProviderError as GeminiProviderError


def gemini_key() -> str:
    return get_settings().gemini_key


def gemini_model() -> str:
    return get_settings().gemini_model


def gemini_available() -> bool:
    return bool(gemini_key())


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Gemini returned JSON, but not an object.")
    return parsed


def request_gemini_json(system: str, prompt: str) -> dict[str, Any]:
    key = gemini_key()
    if not key:
        raise GeminiProviderError("Gemini key is not configured.")
    model = gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?{urlencode({'key': key})}"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.45,
            "topP": 0.9,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "POROS-local-dev"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=get_settings().gemini_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise GeminiProviderError(f"Gemini API returned HTTP {exc.code}; check key, model, quota and permissions.") from None
    except URLError:
        raise GeminiProviderError("Gemini API request failed; check network access.") from None
    except RemoteDisconnected as exc:
        raise GeminiProviderError("Gemini API connection closed before a response was returned.") from exc
    except TimeoutError as exc:
        raise GeminiProviderError("Gemini API request timed out") from exc

    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = "\n".join(str(part.get("text", "")) for part in parts if part.get("text"))
    if not text:
        raise GeminiProviderError("Gemini returned an empty response.")
    try:
        return extract_json_object(text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise GeminiProviderError("Gemini returned invalid JSON.") from exc
