import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/ChartOfAccounts.tsx"),
  "utf8"
);

/**
 * The account dialog used to bind every field straight to the `defaultValues`
 * prop with no onChange, so typing did nothing and Save resubmitted the
 * unchanged defaults (plus a wall of React controlled-input warnings). These
 * tests pin the local-state rewrite.
 */
function dialogBody(): string {
  const start = source.indexOf("function AccountFormDialog(");
  expect(start, "AccountFormDialog must exist").toBeGreaterThan(-1);
  const end = source.indexOf("export default function ChartOfAccounts(");
  expect(end, "ChartOfAccounts must follow the dialog").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("chart of accounts form dialog state wiring", () => {
  it("holds local form state instead of reading the defaultValues prop", () => {
    const body = dialogBody();
    expect(body).toContain("useState<AccountFormValues>(()");
    expect(body).toContain("emptyAccountForm(defaultValues)");
    // the old bug: inputs bound straight to the prop
    expect(body).not.toMatch(/value=\{defaultValues\?\./);
    expect(body).not.toMatch(/checked=\{defaultValues\?\./);
    // the old no-op select handlers
    expect(body).not.toContain("onValueChange={() => {}}");
  });

  it("binds every input to onChange handlers that update form state", () => {
    const body = dialogBody();
    for (const field of [
      "code",
      "name",
      "nameBn",
      "description",
      "openingBalance",
    ]) {
      expect(body, `${field} must update state`).toContain(
        `setField("${field}", event.target.value)`
      );
    }
    expect(body).toContain('setField("isDetail", event.target.checked)');
    expect(body).toContain('setField("accountTypeId", v)');
    expect(body).toContain('setField("parentId", v)');
    expect(body).toContain("checked={values.isDetail}");
    expect(body).toContain("value={values.code}");
    expect(body).toContain("value={values.name}");
  });

  it("validates before submitting and surfaces field errors", () => {
    const body = dialogBody();
    expect(body).toContain("validateAccountForm(values)");
    expect(body).toContain("setShowErrors(true)");
    expect(body).toContain('role="alert"');
    expect(body).toContain("aria-invalid={!!errors.code}");
    // submit must ship the edited state, never the prop snapshot
    expect(body).toContain("buildSubmittedValues(values, lockParentId)");
    expect(body).not.toContain("defaultValues?.code");
  });

  it("prefills edit mode from the existing account and keys remounts per target", () => {
    const page = source.slice(source.indexOf("export default function ChartOfAccounts("));
    expect(page).toContain("code: editingAccount.code");
    expect(page).toContain("name: editingAccount.name");
    expect(page).toContain("accountTypeId: editingAccount.accountTypeId");
    // one dialog instance per target so local form state resets on open
    expect(page).toContain("`edit-${editingAccount.id}`");
    expect(page).toContain("`child-${addingChildTo.id}`");
    expect(page).toContain('"new-root"');
  });

  it("locks the parent for add-child and excludes self plus descendants when editing", () => {
    const page = source.slice(source.indexOf("export default function ChartOfAccounts("));
    expect(page).toContain("lockParentId={addingChildTo?.id}");
    expect(page).toContain("excludeParentId={editingAccount?.id}");
    const body = dialogBody();
    expect(body).toContain("disabled={lockParentId != null}");
    expect(body).toContain("buildParentOptions(accountTree, excludeParentId)");
    // Radix Select rejects value="", so the none-option uses the sentinel
    expect(body).toContain("ROOT_PARENT_VALUE");
    expect(body).not.toContain('SelectItem value=""');
  });

  it("opens the new-account form from the page button via state", () => {
    const page = source.slice(source.indexOf("export default function ChartOfAccounts("));
    expect(page).toContain("onClick={() => setCreatingRoot(true)}");
    // the old wiring opened a detached outer Dialog whose content never rendered
    expect(page).not.toContain("DialogTrigger");
    expect(page).toContain("creatingRoot || !!addingChildTo || !!editingAccount");
  });
});
