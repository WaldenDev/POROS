"""Local configuration assistant. Never makes network requests."""

import argparse
from getpass import getpass
import os
from pathlib import Path

from .config import ENV_PATH, get_settings
from .llm import llm_available, llm_model, llm_provider
from .openai_provider import configuration
from .llm_contracts import LLMProviderError


def write_configuration(path: Path, values: dict[str, str]) -> None:
    if any(any(c in value for c in "\r\n\"'") for value in values.values()):
        raise ValueError("Configuration values must be single-line, without quotes.")
    # O_EXCL prevents accidental replacement of an existing user's secrets.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write("# Local configuration. Never commit this file.\n")
        for key, value in values.items():
            stream.write(f"{key}={value}\n")


def configure(path: Path = ENV_PATH) -> None:
    if path.exists():
        print(f"使用已有配置 {path}，未修改。")
        return
    provider = input("模型接口 [1 Gemini / 2 OpenAI-compatible]，默认 1: ").strip() or "1"
    if provider not in {"1", "2"}:
        raise ValueError("请选择 1 或 2。")
    values = {"GITHUB_TOKEN": getpass("GitHub token（可留空，匿名限流较低）: ").strip()}
    if provider == "1":
        values.update(POROS_LLM_PROVIDER="gemini", GEMINI_KEY=getpass("Gemini API key: ").strip(),
                      GEMINI_MODEL=input("模型 ID [gemini-2.5-flash]: ").strip() or "gemini-2.5-flash")
    else:
        values.update(POROS_LLM_PROVIDER="openai",
                      POROS_OPENAI_BASE_URL=input("API base URL（含供应商要求的 /v1，不含 /chat/completions）: ").strip(),
                      POROS_OPENAI_MODEL=input("模型 ID（以供应商控制台为准）: ").strip(),
                      POROS_OPENAI_API_KEY=getpass("API key: ").strip())
    write_configuration(path, values)
    print(f"已写入 {path}（仅当前用户可读写）。启动后修改需重启 API。")


def check() -> bool:
    settings = get_settings()
    ready = llm_available()
    print(f"配置文件: {'已找到' if ENV_PATH.exists() else '未找到（仍可使用环境变量）'}")
    print(f"GitHub: {'已配置 token' if settings.github_token else '匿名访问，限流较低'}")
    print(f"模型接口: {llm_provider()} / 模型: {llm_model() or '未填写'}")
    print(f"模型配置: {'字段齐全' if ready else '缺失或无效'}")
    if llm_provider() == "openai":
        try:
            configuration()
        except (LLMProviderError, ValueError) as exc:
            print(str(exc) if isinstance(exc, LLMProviderError) else "Base URL 格式无效。")
    print("仅检查本地配置，不验证额度、权限、模型可用性，不发送任何 API 请求。")
    return ready


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check configuration without network access")
    args = parser.parse_args()
    try:
        if args.check:
            raise SystemExit(0 if check() else 1)
        configure()
        if not check():
            print(f"请补全 {ENV_PATH} 中所选接口的配置后重新运行。")
            raise SystemExit(1)
    except (ValueError, FileExistsError, KeyboardInterrupt, EOFError) as exc:
        print(f"配置未完成: {exc}")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
