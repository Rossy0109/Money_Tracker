const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:8000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx serve -l 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
});
