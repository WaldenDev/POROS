"""Provider-neutral JSON completion boundary for business modules."""
from __future__ import annotations

from importlib import import_module
from importlib.util import find_spec

from .config import env_value, get_settings
from .gemini_provider import request_gemini_json
from .llm_contracts import LLMProviderError
from .openai_provider import configuration, request_openai_json


def llm_provider() -> str:
    get_settings()
    return env_value("POROS_LLM_PROVIDER", "gemini")


def llm_model() -> str:
    provider = llm_provider()
    if provider == "openai":
        return env_value("POROS_OPENAI_MODEL", "")
    return env_value("POROS_CODEX_MODEL", "gpt-6-astra") if provider == "codex" else get_settings().gemini_model


def llm_available() -> bool:
    if llm_provider() == "openai":
        try:
            configuration()
            return True
        except (LLMProviderError, ValueError):
            return False
    if llm_provider() == "codex":
        return bool(env_value("POROS_CODEX_BRIDGE_TOKEN")) and find_spec(".codex_provider", __package__) is not None
    return llm_provider() == "gemini" and bool(get_settings().gemini_key)


def request_llm_json(system: str, prompt: str) -> dict:
    provider = llm_provider()
    if provider == "gemini":
        return request_gemini_json(system, prompt)
    if provider == "openai":
        return request_openai_json(system, prompt)
    if provider != "codex":
        raise LLMProviderError("Unsupported LLM provider")
    # The private adapter is optional; the public build has no bridge dependency.
    try:
        adapter = import_module(".codex_provider", __package__)
    except ModuleNotFoundError:
        raise LLMProviderError("This distribution supports gemini or openai providers; update apps/api/.env.") from None
    return adapter.request_codex_json(system, prompt)
