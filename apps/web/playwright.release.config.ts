import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "demo-release.spec.ts",
  use: { baseURL: "http://127.0.0.1:5191", channel: "chrome" },
  webServer: {
    command: "pnpm preview:demo --port 5191 --strictPort",
    url: "http://127.0.0.1:5191",
    reuseExistingServer: false,
  },
});
