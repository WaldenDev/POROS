# 更新记录

## 依赖安全维护 · 2026-11-26

- 公开版使用独立 Python 依赖清单与锁文件，移除未使用的 LangGraph 依赖树。
- 升级 AnyIO、HTTPX2/HTTPCore2、Vite、PostCSS、nanoid 和 source-map-js，修复首发依赖告警；私有版单独升级保留的 LangGraph、certifi 和 urllib3。
- CI 增加 Python / npm 依赖审计，Dependabot 每周检查更新；README 和业务功能未修改。

## Explorer Alpha · 0.1.0 · 2026-11-25

- 上手：新增配置向导与离线配置检查；保留 Gemini，增加 OpenAI-compatible 模型接口。
- 体验：提供独立历史图谱演示构建，无密钥、无后端即可浏览、选择和导出。
- 范围：独立 Explorer API 入口与发布白名单；旧工作台、私人日志、Codex 桥接保留在开发档案，不进入首发导出包。
- 展示：3D 图谱支持最多 7 个项目的多选、弹性牵引、局部聚焦和半透明包围体。
- 文档：重写 README，补齐快速安装、配置、费用与本地部署边界。

首发采用 MIT，自有代码从干净历史发布于 `WaldenDev/POROS`，不继承开发档案。模型对比会话尚未接入；后续先打磨证据质量和实际探索体验。

此前的详细阶段记录保留在开发仓库 `PROJECT_LOG.md`，不混入面向使用者的更新记录。
