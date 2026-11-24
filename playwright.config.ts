import { defineConfig, devices } from '@playwright/test'

// Runs against its own mock (port 4100) and dev server (port 5174), so it never touches
// a mock you have running on 4000. The tests share that one mock, so they run serially.
export default defineConfig({
  testDir: 'e2e',
  timeout: 150_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174', viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    { command: 'PORT=4100 node mock-server.mjs', port: 4100, reuseExistingServer: false },
    {
      command: 'VITE_API_URL=http://localhost:4100 npx vite --port 5174 --strictPort',
      port: 5174,
      reuseExistingServer: false,
    },
  ],
})
