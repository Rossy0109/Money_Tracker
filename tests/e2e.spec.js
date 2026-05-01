const { test, expect } = require('@playwright/test');

test.describe('Elite Money Tracker E2E (React Version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should login with master password', async ({ page }) => {
    // React Login.js uses id="password"
    await page.fill('#password', 'AhmedKamrul010987');
    await page.click('button:has-text("Login")');
    
    // Verify title is shown (Office Expense Tracker)
    await expect(page.locator('h1')).toHaveText('Office Expense Tracker');
  });

  test('should show correct summary cards', async ({ page }) => {
    // Login first
    await page.fill('#password', 'AhmedKamrul010987');
    await page.click('button:has-text("Login")');

    // Check if summary cards are present (Total Income, Total Expense, Balance)
    await expect(page.locator('h5:has-text("Total Income")')).toBeVisible();
    await expect(page.locator('h5:has-text("Total Expense")')).toBeVisible();
    await expect(page.locator('h5:has-text("Balance")')).toBeVisible();
  });

  test('should show transaction form', async ({ page }) => {
    // Login first
    await page.fill('#password', 'AhmedKamrul010987');
    await page.click('button:has-text("Login")');

    // Check for "Add New Transaction" header
    await expect(page.locator('h2:has-text("Add New Transaction")')).toBeVisible();
  });
});
