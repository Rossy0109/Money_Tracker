const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass login UI by setting localStorage before the page loads
    await page.addInitScript(() => {
      window.localStorage.setItem('isLoggedIn', 'true');
      // Set language to English for consistent testing
      window.localStorage.setItem('lang', 'en');
    });
    await page.goto('/');
    // Wait for the application to initialize
    await page.waitForLoadState('networkidle');
  });

  test('application dashboard and navigation', async ({ page }) => {
    // 1. Verify Dashboard Visibility (Bypassed login should land us here)
    const logo = page.locator('.logo');
    await expect(logo).toBeVisible({ timeout: 20000 });
    
    // 2. Check Summary Cards
    // Using data-i18n attributes as they are language-agnostic
    await expect(page.locator('[data-i18n="overview.income"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.expense"]')).toBeVisible();
    await expect(page.locator('[data-i18n="overview.balance"]')).toBeVisible();

    // 3. Navigate to Transactions
    await page.click('li[data-section="transactions"]');
    await expect(page.locator('[data-i18n="transactions.new"]')).toBeVisible();
  });
});
