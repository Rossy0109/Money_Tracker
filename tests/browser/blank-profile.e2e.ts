import { expect, test } from "@playwright/test";

test.describe("blank-profile mobile shell", () => {
  // Ensure we start from a truly logged-out state before each test
  test.beforeEach(async ({ page }) => {
    // Try to log out via the tRPC logout endpoint.
    // If the user is already logged out this is a no-op.
    await page.evaluate(async () => {
      // @ts-expect-error – we expose the trpc client on window for testing only in dev.
      // In the test environment the Vite dev server injects __TRPC_CLIENT__.
      // If it’s not present we simply skip – the request will 404 but that’s fine.
      const trpc = (window as unknown).__TRPC_CLIENT__;
      if (trpc?.auth?.logout?.mutateAsync) {
        await trpc.auth.logout.mutateAsync().catch(() => {});
      }
    });
    // Additionally clear any auth‑related storage that the hook might read.
    await page.context().clearCookies();
    await page.context().clearPermissions();
  });

  test("shows the non-mutating sign-in gate on a blank mobile profile", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: /সাইন ইন/ }).first()
    ).toBeVisible();

    if (testInfo.project.name === "iphone-safari") {
      await expect(
        page.getByRole("button", { name: /সাইন ইন/ }).first()
      ).toBeEnabled();
    }
  });

  test("keeps private report and finance controls behind authentication on a blank profile", async ({
    page,
  }) => {
    await page.goto("/family");
    await expect(
      page.getByRole("button", { name: /সাইন ইন/ }).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /PDF ডাউনলোড/ })).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: /চার্টের ছবি/ })).toHaveCount(
      0
    );
  });

  test("publishes installable PWA metadata, with Chromium verifying the offline worker", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest"
    );

    if (testInfo.project.name !== "android-chrome") return;

    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? "";
    });
    expect(worker).toContain("/sw.js");
  });
});
