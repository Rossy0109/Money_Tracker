const { test, expect } = require('@playwright/test');

test.describe('Foot Print of Money E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    // Pipe browser console to stdout
    page.on('console', msg => console.log(`[BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BROWSER ERROR] ${err.message}`));
    page.on('requestfailed', request => console.log(`[BROWSER REQ FAIL] ${request.url()}: ${request.failure().errorText}`));

    // Bypass login UI by setting localStorage before the page loads
    await page.addInitScript(() => {
      window.__ENV = {
        NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaDummyKey'
      };
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
