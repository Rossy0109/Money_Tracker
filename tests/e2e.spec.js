const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (Ultimate Version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should login with master password', async ({ page }) => {
    // Ultimate index.html uses id="master-password"
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button:has-text("প্রবেশ করুন")');
    
    // Verify title is shown (Elite Tracker)
    await expect(page.locator('.logo')).toHaveText('💰 Elite Tracker');
  });

  test('should show correct summary cards', async ({ page }) => {
    // Login first
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button:has-text("প্রবেশ করুন")');

    // Check if summary cards are present
    await expect(page.locator('h3:has-text("মোট আয়")')).toBeVisible();
    await expect(page.locator('h3:has-text("মোট খরচ")')).toBeVisible();
    await expect(page.locator('h3:has-text("ব্যালেন্স")')).toBeVisible();
  });

  test('should show transaction form', async ({ page }) => {
    // Login first
    await page.fill('#master-password', 'AhmedKamrul010987');
    await page.click('button:has-text("প্রবেশ করুন")');

    // Go to transactions section
    await page.click('li[data-section="transactions"]');

    // Check for "নতুন লেনদেন" header
    await expect(page.locator('h2:has-text("নতুন লেনদেন")')).toBeVisible();
  });
});
