import { defineConfig, devices } from "@playwright/test";

// Smoke tests against a production build with the CI fixture snapshot.
//   pnpm build:fixture && pnpm e2e
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, ...(process.env.CI ? {} : { channel: "chrome" }) },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    env: { CONTENT_SOURCE: "snapshot", CONTENT_SNAPSHOT: "test/fixtures/snapshot.json" },
  },
});
