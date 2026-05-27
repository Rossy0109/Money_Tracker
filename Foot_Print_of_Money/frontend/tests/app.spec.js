import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://localhost:3005/');
  await expect(page).toHaveTitle(/Money Footprint/);
});

test('login redirect', async ({ page }) => {
  await page.goto('http://localhost:3005/dashboard');
  await expect(page).toHaveURL(/.*login/);
});
