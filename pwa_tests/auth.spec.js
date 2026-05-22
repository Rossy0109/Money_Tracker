const { test, expect } = require('@playwright/test');

test('PWA loads and shows Auth section', async ({ page }) => {
  await page.goto('http://localhost:8000');
  
  // Verify that the login form is present
  const authSection = page.locator('#auth-section');
  await expect(authSection).toBeVisible();
});
