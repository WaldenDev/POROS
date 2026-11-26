# 参与 POROS

公开版围绕 Explorer：GitHub 检索、可追溯关系、图谱操作与选集。请先用 Issue 说明要解决的使用问题，再提交范围明确的 PR；大型功能先讨论。

## 本地检查

正常使用按 README 的本地运行步骤操作。开发时如需历史数据，在开发服务打开 `/?mode=static`，不会发起业务 API 请求。独立演示构建使用 `pnpm build:demo`、`pnpm preview:demo`，这是开发预览用途，不是正常部署入口。普通构建使用 `pnpm build:explorer`，仍需运行后端。

后端：在 `apps/api` 运行 `uv sync --frozen`，然后 `uv run python -m unittest test_release_setup`。

前端：在 `apps/web` 运行 `pnpm install --frozen-lockfile`、`pnpm exec tsx --test tests/static-preview.test.ts`、`pnpm build:explorer` 和 `pnpm build:demo`。

浏览器检查：安装 Chrome 后运行 `pnpm exec playwright test --config playwright.release.config.ts`。测试使用历史数据，不需要密钥。涉及图谱交互的修改请附桌面和窄屏截图。

## 提交边界

- 不提交 `.env`、token、数据库、个人路径、私人对话或运行日志。
- 不把旧工作台和未完成的实验模块带入公开版。
- 提交新关系策略时保留证据来源与缺失信息，避免将推断描述为事实。
- 第三方材料注明来源和许可，不将抓取内容重新标为 POROS 自有代码。
- API 配置只留在后端；测试使用 mock，不依赖贡献者的真实额度。

提交前确认你有权贡献相应内容。安全问题不要在公开 Issue 中附密钥或利用细节，参见 [安全说明](SECURITY.md)。
