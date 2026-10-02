import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const layout = read("client/src/components/DashboardLayout.tsx");
const transactions = read(
  "client/src/components/dashboard/TransactionsPanel.tsx"
);
const gestures = read("client/src/mobile/useRowGestures.ts");

describe("phone bottom tab bar wiring", () => {
  it("offers five one-tap destinations instead of the full drawer", () => {
    expect(layout).toContain('aria-label="দ্রুত নেভিগেশন"');
    for (const label of ["ড্যাশবোর্ড", "ভাউচার", "লেনদেন", "রিপোর্ট"]) {
      expect(layout).toContain(`"${label}"`);
    }
    expect(layout).toContain("আরও");
    expect(layout).toContain("const bottomTabs: MenuItem[]");
    expect(layout).toContain("const inputOnlyBottomTabs: MenuItem[]");
  });

  it("renders only below md, respects the safe area, and marks the current page", () => {
    expect(layout).toContain(
      "fixed inset-x-0 bottom-0 z-40 border-t border-[#0c2b22] bg-[#113a30] pb-[env(safe-area-inset-bottom)]"
    );
    expect(layout).toContain("md:hidden");
    expect(layout).toContain('aria-current={active ? "page" : undefined}');
    expect(layout).toContain("const [path] = useLocation()");
  });

  it("keeps the footer and last row reachable behind the fixed bar", () => {
    expect(layout).toContain(
      "pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0"
    );
  });

  it("opens the full drawer from the more tab and filters tabs by permission", () => {
    expect(layout).toContain("onClick={() => setOpenMobile(true)}");
    expect(layout).toContain('aria-label="সব মেনু খুলুন"');
    expect(layout).toContain(
      "item => !item.permission || hasPermission(user, item.permission)"
    );
  });
});

describe("transaction row gesture wiring", () => {
  it("renders rows through a component that owns the touch handlers", () => {
    expect(transactions).toContain("<TransactionRow");
    expect(transactions).toContain("const gestures = useRowGestures({");
    expect(transactions).toContain('touchAction: "pan-y"');
  });

  it("swipes to edit and delete and long-presses into the editor", () => {
    expect(transactions).toContain("onLongPress: onEdit");
    expect(transactions).toContain("onDelete: target => onDelete(target.id)");
    expect(gestures).toContain('if (action === "edit") onEdit?.(row);');
    expect(gestures).toContain('if (action === "delete") onDelete?.(row);');
  });

  it("never starts a gesture on the row's own buttons or links", () => {
    expect(gestures).toContain(
      'target.closest("button, a, input, select, textarea, label")'
    );
    expect(gestures).toContain("longPressRef.current?.cancelTouch();");
  });
});
