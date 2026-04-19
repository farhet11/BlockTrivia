import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,            // 5 min per test (full game can take ~4 min)
  expect: { timeout: 30_000 }, // generous wait for game phase transitions
  fullyParallel: false,        // game tests are inherently sequential
  workers: 1,                  // single worker — game state is shared
  retries: 0,                  // no retries — game state is stateful
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    // Use system Chrome — no separate Playwright browser download needed
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 — mobile-first
    ignoreHTTPSErrors: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  // Automatically start the dev server if not already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
