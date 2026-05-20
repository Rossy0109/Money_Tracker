const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './frontend/pwa_tests',
  use: {
    baseURL: 'http://localhost:8000',
    screenshot: 'only-on-failure',
    permissions: ['geolocation', 'microphone', 'camera'],
    launchOptions: {
      args: ['--disable-web-security', '--disable-site-isolation-trials']
    }
  },
  webServer: {
    command: 'npx serve -l 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
});
