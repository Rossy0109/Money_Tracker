import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "small phone", width: 360, height: 740 },
  { name: "phone landscape", width: 740, height: 360 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide desktop", width: 1600, height: 900 },
];

const noHorizontalOverflow = async (page: import("@playwright/test").Page) => {
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  );
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 5);
};

test.describe("layout auto-adjusts across phone, tablet, and desktop widths", () => {
  for (const viewport of VIEWPORTS) {
    test(`sign-in gate fits a ${viewport.name} without sideways scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/");

      const signInButton = page
        .getByRole("button", { name: /সাইন ইন/ })
        .first();
      await expect(signInButton).toBeVisible();

      const box = await signInButton.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 5);
      }

      await noHorizontalOverflow(page);
    });

    test(`redirected private route stays inside a ${viewport.name} viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/family");

      await expect(
        page.getByRole("button", { name: /সাইন ইন/ }).first()
      ).toBeVisible();
      await noHorizontalOverflow(page);
    });
  }

  test("keyboard focus stays reachable inside the viewport at phone width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");

    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      const inViewport = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return true;
        const rect = active.getBoundingClientRect();
        return rect.right >= 0 && rect.left <= window.innerWidth + 5;
      });
      expect(inViewport).toBe(true);
    }
  });
});
