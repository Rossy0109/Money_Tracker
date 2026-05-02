const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should login with master password', async ({ page }) => {
    // Ultimate index.html uses id="master-password"
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button[data-i18n="enter"]');
    
    // Verify title is shown (Elite Tracker)
    await expect(page.locator('.logo')).toHaveText('💰 Elite Tracker');
  });

  test('should show correct summary cards', async ({ page }) => {
    // Login first
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button[data-i18n="enter"]');

    // Wait for login section to disappear and dashboard to appear
    await expect(page.locator('#login-section')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#dashboard-section')).toBeVisible({ timeout: 10000 });

    // Check if summary cards are present using data-i18n attributes
    await expect(page.locator('[data-i18n="overview.income"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.expense"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.balance"]')).toBeVisible();
  });

  test('should show transaction form', async ({ page }) => {
    // Login first
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button[data-i18n="enter"]');

    // Wait for dashboard
    await expect(page.locator('#dashboard-section')).toBeVisible({ timeout: 10000 });

    // Go to transactions section
    await page.click('li[data-section="transactions"]');

    // Check for "নতুন লেনদেন" header
    await expect(page.locator('[data-i18n="transactions.new"]')).toBeVisible();
  });
});
