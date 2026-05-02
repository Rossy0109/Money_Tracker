const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to be fully loaded including Firebase scripts
    await page.waitForLoadState('networkidle');
  });

  test('full application flow: login and dashboard navigation', async ({ page }) => {
    // 1. Login using the method that worked in previous runs
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button[data-i18n="enter"]');
    
    // 2. Verify Dashboard Visibility
    // We wait for the sidebar logo which only appears after a successful login
    const logo = page.locator('.logo');
    await expect(logo).toBeVisible({ timeout: 15000 });
    await expect(logo).toContainText('Elite Tracker');

    // 3. Check Summary Cards (using data-i18n)
    await expect(page.locator('[data-i18n="overview.income"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.expense"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.balance"]')).toBeVisible();

    // 4. Navigate to Transactions
    await page.click('li[data-section="transactions"]');
    await expect(page.locator('[data-i18n="transactions.new"]')).toBeVisible();
  });
});
