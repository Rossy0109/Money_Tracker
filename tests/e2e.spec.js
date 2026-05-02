const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ensure the page is ready
    await expect(page.locator('#master-password')).toBeVisible();
  });

  test('full application flow: login and dashboard navigation', async ({ page }) => {
    // 1. Login
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.press('#master-password', 'Enter');
    
    // 2. Verify Dashboard Visibility
    const dashboard = page.locator('#dashboard-section');
    await expect(dashboard).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.logo')).toContainText('Elite Tracker');

    // 3. Check Summary Cards (using data-i18n)
    await expect(page.locator('[data-i18n="overview.income"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.expense"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.balance"]')).toBeVisible();

    // 4. Navigate to Transactions
    await page.click('li[data-section="transactions"]');
    await expect(page.locator('[data-i18n="transactions.new"]')).toBeVisible();

    // 5. Navigate to Reports
    await page.click('li[data-section="reports"]');
    await expect(page.locator('#section-reports')).toBeVisible();
  });
});
