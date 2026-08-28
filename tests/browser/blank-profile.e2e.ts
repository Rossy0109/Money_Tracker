import { expect, test } from "@playwright/test";

test.describe("blank-profile mobile shell", () => {
  test("shows the non-mutating sign-in gate on a blank mobile profile", async ({ page }, testInfo) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: /সাইন ইন/ })).toBeVisible();

    if (testInfo.project.name === "iphone-safari") {
      await expect(page.getByRole("button", { name: /সাইন ইন/ })).toBeEnabled();
    }
  });

  test("keeps private report and finance controls behind authentication on a blank profile", async ({ page }) => {
    await page.goto("/family");
    await expect(page.getByRole("button", { name: /সাইন ইন/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /PDF ডাউনলোড/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /চার্টের ছবি/ })).toHaveCount(0);
  });

  test("publishes installable PWA metadata, with Chromium verifying the offline worker", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

    if (testInfo.project.name !== "android-chrome") return;

    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? "";
    });
    expect(worker).toContain("/sw.js");
  });
});
