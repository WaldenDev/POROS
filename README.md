<div align="center">

# POROS

### Find the connections. Explore what comes next.

用 AI 理解 GitHub 项目之间的关系，在图谱中寻找下一步的灵感。

[本地运行](#本地运行) · [配置帮助](docs/configuration.md) · [更新记录](CHANGELOG.md) · [MIT](LICENSE)

</div>

![POROS：项目图谱、证据详情与多项目选集](docs/assets/selection-volume-2026-11/four-desktop.png)

输入一个关键词，或点击「随便看看」，发现开源项目；让 AI 阅读项目材料、整理关联，再沿着图谱继续探索。

- **发现项目**：GitHub 搜索，支持 Star、语言和更新时间筛选。
- **看懂关联**：整理项目事实与关系，保留原文摘录和来源链接。
- **交互探索**：3D 图谱、节点展开、多选聚焦与选集导出。

这是一个持续开发中的早期版本。目前就是一个 Python 后端和一个网页前端，使用你自己的模型 API，本地 SQLite 自动保存图谱，无需部署数据库。

## 本地运行

准备 [Node.js](https://nodejs.org/en/download) 22.12+、[pnpm](https://pnpm.io/installation) 11 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。uv 会管理 Python 环境，无需手动创建虚拟环境。

### 1. 下载并配置 API

```bash
git clone https://github.com/WaldenDev/POROS.git
cd POROS/apps/api
uv run --frozen python -m poros_api.setup
```

按提示选择 **Gemini** 或 **OpenAI-compatible**，填写 API key 和模型名；兼容接口还需填写供应商的 Base URL。GitHub token 可留空，填写后可提高查询限额。

配置会保存在 `apps/api/.env`，只需做一次。向导不会覆盖已有文件，也不会发起付费请求。

### 2. 启动后端和前端

在刚才的终端启动后端：

```bash
uv run --frozen uvicorn poros_api.public_main:app --host 127.0.0.1 --port 8787
```

另开一个终端，进入刚才克隆的 `POROS` 目录，然后运行：

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm dev
```

### 3. 打开页面

访问 **[http://127.0.0.1:5177/](http://127.0.0.1:5177/)**，输入关键词开始搜索。想分析这批项目时，在「路线」面板点击「整理关系与路线」。不需要切换模式或修改前端配置。

以后使用只需启动这两个服务；没有更新依赖时无需重新安装。退出时在两个终端分别按 `Ctrl+C`。

## 使用须知

- 模型分析会消耗你自己的 API 额度，输出的关系仍需结合原文判断。多项目持续对话尚未接入。
- 密钥仅放在后端 `apps/api/.env`，不要上传或填入前端；修改后重启后端。
- 当前适合本机单用户使用，没有登录鉴权，请勿直接将后端开放到公网。

遇到问题见 [配置与排错](docs/configuration.md)，也欢迎提交 [Issue](https://github.com/WaldenDev/POROS/issues)。开发与测试见 [贡献说明](CONTRIBUTING.md)；第三方材料与依赖见 [许可说明](THIRD_PARTY.md)。
