import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`demo release remains interactive and never calls business APIs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => {
      requests.push(route.request().url());
      return route.abort();
    });
    await page.goto("/?mode=live");
    await expect(page.locator(".explore-toolbar")).toContainText("示例图谱");
    await expect(page.locator(".repo-index-row")).toHaveCount(12);
    await expect(page.getByRole("textbox", { name: "启发词" })).toBeDisabled();
    await expect(page.locator(".graph-scene canvas")).toBeVisible();
    await page.locator(".repo-index-row > button").first().click();
    await expect(page.locator(".inspector h2")).toHaveText("mudler/LocalAI");
    await expect(page.locator(".knowledge-fact").first()).toBeVisible();
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.getByRole("button", { name: "多选", exact: true }).click();
    for (let i = 0; i < 2; i++) await page.locator(".repo-index").getByRole("checkbox").nth(i).check();
    await expect(page.locator(".selection-item")).toHaveCount(2);
    await page.getByRole("button", { name: "查看选集", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出选集", exact: true }).click();
    expect((await pending).suggestedFilename()).toBe("poros-selection.json");
    await page.getByRole("button", { name: "关闭选集", exact: true }).click();
    await page.waitForTimeout(2500);
    const canvas = await page.locator(".graph-scene canvas").screenshot();
    const colored = await page.evaluate(async encoded => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const output = document.createElement("canvas");
      output.width = image.width; output.height = image.height;
      const ctx = output.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, output.width, output.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 30) count++;
      return count;
    }, canvas.toString("base64"));
    expect(colored).toBeGreaterThan(50);
    await page.screenshot({ path: `test-results/demo-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
