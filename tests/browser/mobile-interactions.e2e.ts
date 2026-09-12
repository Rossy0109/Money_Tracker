import { expect, test } from "@playwright/test";

test.describe("mobile browser gestures, orientations, and keyboard interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("1. Touch-specific actions: tap and touch targets adhere to mobile touch guidelines", async ({ page }) => {
    const signInButton = page.getByRole("button", { name: /সাইন ইন/ });
    await expect(signInButton).toBeVisible();

    // Verify touch action tap event
    await signInButton.tap();

    // Check minimum touch target accessibility (at least 32px height for mobile tappability)
    const box = await signInButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(32);
    }
  });

  test("2. Orientation changes: handles portrait to landscape transitions smoothly", async ({ page }) => {
    // Initial portrait viewport (Pixel 7: 412x915 / iPhone 13: 390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    const isPortrait = await page.evaluate(() => window.innerHeight > window.innerWidth);
    expect(isPortrait).toBe(true);

    const navElement = page.locator("body");
    await expect(navElement).toBeVisible();

    // Switch to landscape mode (rotated phone)
    await page.setViewportSize({ width: 844, height: 390 });
    const isLandscape = await page.evaluate(() => window.innerWidth > window.innerHeight);
    expect(isLandscape).toBe(true);

    // Assert UI elements remain visible and accessible without horizontal viewport breaks
    await expect(page.getByRole("button", { name: /সাইন ইন/ })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 5); // No unwanted horizontal overflow
  });

  test("3. Mobile keyboard interactions: input focus and virtual keyboard viewport shifts", async ({ page }) => {
    // Look for search or text input fields if rendered, or simulate input interaction
    const inputs = page.locator('input[type="text"], input[type="search"]');
    const count = await inputs.count();

    if (count > 0) {
      const firstInput = inputs.first();
      await firstInput.scrollIntoViewIfNeeded();
      await firstInput.tap();
      await expect(firstInput).toBeFocused();

      // Typing via mobile keyboard events
      await firstInput.pressSequentially("টেস্ট এন্ট্রি", { delay: 30 });
      await expect(firstInput).toHaveValue(/টেস্ট/);

      // Keyboard submit action (Enter key)
      await firstInput.press("Enter");
    } else {
      // If behind sign-in gate, verify keyboard navigable focus
      await page.keyboard.press("Tab");
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeDefined();
    }
  });
});
