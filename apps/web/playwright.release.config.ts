import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:5191", channel: "chrome" },
  projects: [
    { name: "demo", testMatch: "demo-release.spec.ts" },
    { name: "local", testMatch: "local-start.spec.ts", use: { baseURL: "http://127.0.0.1:5192" } },
  ],
  webServer: [{
    command: "pnpm preview:demo --port 5191 --strictPort",
    url: "http://127.0.0.1:5191",
    reuseExistingServer: false,
  }, {
    command: "pnpm dev --port 5192 --strictPort",
    url: "http://127.0.0.1:5192",
    reuseExistingServer: false,
  }],
});
