# API 配置

## 推荐：向导

在 `apps/api` 运行：

```bash
uv sync --frozen
uv run python -m poros_api.setup
uv run python -m poros_api.setup --check
```

向导只创建新的 `.env`，权限为仅当前用户读写。已有文件不会覆盖，也不会打印密钥。检查不联网、不验证余额和模型权限；退出码 `0` 表示字段齐全，`1` 表示配置缺失或无效。环境变量优先于文件，修改后重启 API。

## 手动配置

也可复制 `apps/api/.env.example` 为同目录 `.env`，只填所选接口的字段。根目录 `.env` 不会被加载。

**Gemini：**

```dotenv
GITHUB_TOKEN=
POROS_LLM_PROVIDER=gemini
GEMINI_KEY=your-api-key
GEMINI_MODEL=gemini-2.5-flash
```

**OpenAI-compatible：**

```dotenv
GITHUB_TOKEN=
POROS_LLM_PROVIDER=openai
POROS_OPENAI_BASE_URL=https://api.deepseek.com
POROS_OPENAI_API_KEY=your-api-key
POROS_OPENAI_MODEL=your-provider-model-id
POROS_OPENAI_JSON_MODE=true
POROS_OPENAI_TIMEOUT_SECONDS=90
```

此处 Base URL 仅示范填写方式，不代表每家供应商地址相同。按供应商文档填写，必要时包含 `/v1`，**不要包含 `/chat/completions`**；模型 ID 使用账户实际可用值。实现使用 Chat Completions，不是 Responses API。默认请求 JSON object，模型最终内容必须是 JSON 对象，不接受截断响应。兼容接口不等于所有厂商、模型都已实测。

若接口不接受 `response_format`，可以设 `POROS_OPENAI_JSON_MODE=false`，但仍要求模型最终输出 JSON。只对本机地址允许 HTTP，其余地址需 HTTPS；拒绝 URL 中的账号、查询参数和重定向，避免密钥外泄。不会自动切换厂商或盲目重试计费请求。

接口依据：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。具体模型、价格和额度以供应商为准。

## GitHub 与本地运行

- `GITHUB_TOKEN` 可不填，匿名限流更低。使用细粒度 token 时仅需公开仓库只读访问，不授予写入或管理权限。
- 模型缺失不影响基础 GitHub 搜索；关系分析需要模型配置。关联展开在可用时使用模型策略。
- 图谱数据默认存入根目录 `data/poros.db` 的 Atlas 表；无需另装数据库服务。
- 前端默认访问 `http://127.0.0.1:8787`。换后端端口时在 `apps/web/.env.local` 写 `VITE_API_BASE_URL=http://127.0.0.1:新端口` 并重启 Vite。不要在前端环境变量里放 token。
- 默认允许前端本机 `5177` / `5178` 端口跨域。不要将这个无鉴权 Alpha API 直接部署到公网。

## 常见情况

| 情况 | 检查方法 |
| --- | --- |
| 搜索框不可用 | 当前是演示模式。开发服务打开 `/?mode=live`；静态 demo 构建不能切换真实模式 |
| 模型未配置 | 在 `apps/api` 运行 `uv run python -m poros_api.setup --check`，修改配置后重启 API |
| 页面无法连接 API | 确认 API 已启动，访问 `http://127.0.0.1:8787/api/health`；健康状态不表示上游连通 |
| 模型 HTTP 401 / 403 | 检查 key 和该模型的调用权限 |
| 模型 HTTP 404 / 400 | 检查 Base URL、模型 ID、JSON mode 支持；不要重复追加路径 |
| HTTP 429 或 GitHub 结果暂不可用 | 检查额度、上游限流及网络，稍后重试 |
| 分析部分失败 | 保留已完成材料，不把缺失内容当作负面结论；稍后手动重新整理 |
| 启动端口被占用 | 先停止同项目旧服务，或自行指定端口并同步 API 地址及 CORS 配置 |

图谱整理可能调用多次模型。目前只有小批量与请求超时限制，**没有账户级费用硬上限**；初次建议使用有额度上限的独立 key。公开仓库材料也可能含提示注入内容，应核对原文，不把模型关联当作权威结论。
