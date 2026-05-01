const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx serve -s Money_Tracker/client/build -l 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
});
