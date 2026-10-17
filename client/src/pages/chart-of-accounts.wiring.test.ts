import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/ChartOfAccounts.tsx"),
  "utf8"
);

/**
 * The account-tree row used to render its action buttons inside the
 * CollapsibleTrigger, producing <button><button></button></button>, which
 * React reports as an invalid DOM nesting warning and which breaks the
 * accessibility tree. The actions now sit beside the trigger, so this pins
 * that structure down.
 */
function triggerBody(): string {
  const start = source.indexOf("<CollapsibleTrigger");
  expect(start, "CollapsibleTrigger must exist").toBeGreaterThan(-1);
  const end = source.indexOf("</CollapsibleTrigger>", start);
  expect(end, "CollapsibleTrigger must be closed").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("chart of accounts account-tree wiring", () => {
  it("keeps interactive action buttons out of the collapsible trigger", () => {
    const body = triggerBody();
    expect(body).not.toContain("<Button");
    expect(body).not.toContain("<button");
    // the trigger still renders the row's display content
    expect(body).toContain("ChevronDown");
    expect(body).toContain("account.code");
    expect(body).toContain("account.name");
  });

  it("still wires add, edit and delete actions with accessible labels", () => {
    const afterTrigger = source.slice(
      source.indexOf("</CollapsibleTrigger>")
    );
    expect(afterTrigger).toContain('aria-label="Add child account"');
    expect(afterTrigger).toContain('aria-label="Edit account"');
    expect(afterTrigger).toContain('aria-label="Delete account"');
    expect(afterTrigger).toContain("disabled={hasChildren}");
  });

  it("reveals the action group for keyboard focus, not only hover", () => {
    expect(source).toContain(
      "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100"
    );
  });
});
