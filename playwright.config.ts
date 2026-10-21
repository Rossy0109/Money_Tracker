import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  // The default 5s expect budget is only enough when the Vite dev server has
  // already compiled the client graph. On a slow host the first meaningful
  // render (module transform + hydration + the session check) measures ~7s, so
  // the same assertion times out before the UI exists. Only the wait budget
  // is widened — every assertion stays exactly as strict.
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        launchOptions: { args: ["--disable-dev-shm-usage", "--disable-gpu"] },
      },
    },
    {
      name: "iphone-safari",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
