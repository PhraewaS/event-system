import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test"))
  throw new Error("Set TEST_DATABASE_URL to a dedicated *_test database.");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
    ["json", { outputFile: "artifacts/e2e-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "artifacts/playwright-results",
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run db:migrate && npm run start",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: database,
      NODE_ENV: "test",
      PORT: "3100",
      SESSION_SECRET: "e2e-synthetic-session-secret-at-least-32-chars",
    },
    timeout: 60000,
  },
});
