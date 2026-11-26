# 配置与排错

正常安装只需按 [README](../README.md#本地运行) 操作。本页用于修改已有配置或排查问题。

## API 配置

配置文件固定为 `apps/api/.env`。首次向导会创建文件并检查必填项；已有文件不会覆盖。修改后重启后端，环境变量优先于文件。

只填你使用的接口即可，不需要同时配置两家。

**Gemini：**

```dotenv
GITHUB_TOKEN=
POROS_LLM_PROVIDER=gemini
GEMINI_KEY=your-api-key
GEMINI_MODEL=your-model-id
```

**OpenAI-compatible Chat Completions：**

```dotenv
GITHUB_TOKEN=
POROS_LLM_PROVIDER=openai
POROS_OPENAI_BASE_URL=https://your-provider.example/v1
POROS_OPENAI_API_KEY=your-api-key
POROS_OPENAI_MODEL=your-model-id
```

Base URL 和模型名以供应商给出的值为准。URL 不要包含 `/chat/completions`；如果供应商要求 `/v1`，则保留。仅支持 Chat Completions，不是 Responses API。远程接口需要 HTTPS，本机接口可用 HTTP。

若供应商不支持 `response_format`，在 `.env` 加 `POROS_OPENAI_JSON_MODE=false`；模型仍须能按要求输出 JSON。兼容接口不代表所有模型都已实测。

GitHub token 可留空。若填写，仅需公开仓库只读访问，无需写入或管理权限。图谱数据库会自动创建在 `data/poros.db`。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 页面无法连接后端 | 确认后端终端仍在运行，打开 `http://127.0.0.1:8787/api/health` 检查 |
| 搜索或分析按钮锁定 | 正常启动应打开首页，不带 `?mode=static`；不要使用开发者专用的 demo 构建 |
| 模型未配置 | 检查 `apps/api/.env`；在 `apps/api` 运行 `uv run --frozen python -m poros_api.setup --check`，然后重启后端 |
| 模型返回 401 / 403 | 核对 key 与模型调用权限 |
| 模型返回 400 / 404 | 核对 Base URL、模型名与 JSON 格式支持 |
| 429 / GitHub 请求失败 | 检查网络、额度和上游限流；匿名 GitHub 查询可配置只读 token |
| 端口被占用 | 关闭之前启动的同项目旧服务再运行，不要同时启动多份 |
| 部分材料整理失败 | 已完成内容会保留，稍后手动重新整理；缺失内容不代表项目能力差 |

配置检查不联网，只验证本地字段，不验证余额、权限或模型连通性。首次使用建议选有额度上限的独立 key；图谱分析会调用多次模型，项目没有账户级费用硬上限。

## 非默认端口

通常不需要修改端口。必须更换时，后端地址通过 `apps/web/.env.local` 的 `VITE_API_BASE_URL` 设置，重启前端后生效。后端默认仅允许本机 `5177` / `5178` 前端来源；更换前端端口还需同步调整 `public_main.py` 的 CORS 配置。不要在 `VITE_*` 中填写密钥。
