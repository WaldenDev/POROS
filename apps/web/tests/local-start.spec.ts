import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const recording = JSON.parse(readFileSync(
  new URL("../src/explorer/debug/local-llm.json", import.meta.url), "utf8",
));

for (const width of [1440, 390]) {
  test(`default local page can search and request analysis at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Exercise the normal live controller without GitHub or paid model requests.
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push(path);
      if (path === "/api/explore/search") {
        expect(request.postDataJSON().query).toBe("local llm");
        return route.fulfill({ json: {
          repos: recording.result.repos, edges: recording.result.edges,
          warnings: [], analysis_available: true,
        } });
      }
      if (path === "/api/explore/atlas") {
        expect(request.postDataJSON().repositories).toHaveLength(12);
        return route.fulfill({ json: { id: "local-start-test" } });
      }
      if (path === "/api/explore/atlas/jobs/local-start-test")
        return route.fulfill({ json: { status: "completed", result: recording.result.atlas } });
      throw new Error(`Unexpected business request: ${path}`);
    });
    await page.goto("/");
    const input = page.getByRole("textbox", { name: "启发词" });
    await expect(input).toBeEnabled();
    await expect(page.getByRole("button", { name: "随便看看", exact: true })).toBeEnabled();
    await expect(page.locator(".explore-toolbar")).not.toContainText("静态调试");
    expect(requests).toEqual([]);
    await input.fill("local llm");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.locator(".repo-index-row")).toHaveCount(12);
    await expect(page.locator(".graph-scene canvas")).toBeVisible();
    expect(requests).toEqual(["/api/explore/search"]);
    await page.getByRole("tab", { name: "路线", exact: true }).click();
    await page.getByRole("button", { name: "整理关系与路线", exact: true }).click();
    await expect(page.locator(".atlas-status")).toContainText("61 条事实");
    await expect(page.locator(".route-tabs button")).toHaveCount(7);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-results/local-start-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests).toEqual([
      "/api/explore/search", "/api/explore/atlas", "/api/explore/atlas/jobs/local-start-test",
    ]);
    expect(errors).toEqual([]);
  });
}
