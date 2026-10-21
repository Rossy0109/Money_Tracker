import { describe, expect, it } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

/**
 * DB integrity audit, enforced as a regression test.
 *
 * Financial history must never disappear through an accidental parent-row
 * deletion. Every foreign key that points at financial records therefore uses
 * RESTRICT (the delete fails) or SET NULL (the history row survives without
 * its parent) — never CASCADE.
 *
 * CASCADE is allowed only for:
 *  - ephemeral/operational rows scoped to a user (sessions, login history,
 *    idempotency keys) and RBAC assignment rows, and
 *  - composite line-items that are part of an explicitly deleted parent
 *    document (voucher lines, journal lines, invoice lines, reconciliation
 *    items). Those parents are themselves RESTRICT-guarded from every
 *    immutable record (ledger entries, journal entries, audit rows).
 */
const EXPECTED_CASCADES = new Set([
  "user_sessions.userId->users",
  "login_history.userId->users",
  "user_roles.userId->users",
  "user_roles.roleId->roles",
  "role_permissions.roleId->roles",
  "role_permissions.permissionId->permissions",
  "finance_voucher_debits.voucherId->finance_vouchers",
  "finance_voucher_credits.voucherId->finance_vouchers",
  "finance_journal_lines.journalEntryId->finance_journal_entries",
  "finance_bank_reconciliation_items.reconciliationId->finance_bank_reconciliations",
  "finance_invoice_items.invoiceId->finance_invoices",
  "idempotency_keys.userId->users",
]);

function cascadeEdges(): string[] {
  const edges: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    for (const fk of config.foreignKeys) {
      if (fk.onDelete === "cascade") {
        const ref = fk.reference();
        const from = ref.columns.map(column => column.name).join(",");
        edges.push(`${config.name}.${from}->${getTableName(ref.foreignTable)}`);
      }
    }
  }
  return edges.sort();
}

describe("canonical accounting schema", () => {
  it("uses a nullable transaction idempotency key with scoped uniqueness and fingerprint index", () => {
    const config = getTableConfig(schema.financeTransactions);
    const key = config.columns.find(column => column.name === "idempotencyKey");
    const fingerprint = config.columns.find(
      column => column.name === "requestFingerprint"
    );
    const indexes = config.indexes as any[];
    const unique = indexes.find(
      index => index.config.name === "finance_transactions_idempotency_unique"
    );
    const fingerprintIndex = indexes.find(
      index => index.config.name === "finance_transactions_fingerprint_idx"
    );
    expect(key?.notNull).toBe(false);
    expect(fingerprint?.notNull).toBe(false);
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((column: any) => column.name)).toEqual([
      "userId",
      "projectId",
      "idempotencyKey",
    ]);
    expect(fingerprintIndex?.config.name).toBe(
      "finance_transactions_fingerprint_idx"
    );
  });

  it("links transactions to vouchers and canonical lines to chart accounts", () => {
    const transactionConfig = getTableConfig(schema.financeTransactions);
    const debitConfig = getTableConfig(schema.financeVoucherDebits);
    const ledgerConfig = getTableConfig(schema.financeLedgerEntries);
    const transactionVoucher = transactionConfig.foreignKeys.find(
      fk => fk.reference().columns[0].name === "voucherId"
    );
    const debitCoa = debitConfig.foreignKeys.find(
      fk => fk.reference().columns[0].name === "chartOfAccountId"
    );
    const ledgerCoa = ledgerConfig.foreignKeys.find(
      fk => fk.reference().columns[0].name === "chartOfAccountId"
    );
    expect(transactionVoucher?.reference().foreignTable).toBe(
      schema.financeVouchers
    );
    expect(debitCoa?.reference().foreignTable).toBe(
      schema.financeChartOfAccounts
    );
    expect(ledgerCoa?.reference().foreignTable).toBe(
      schema.financeChartOfAccounts
    );
  });
});

describe("schema delete integrity", () => {
  it("allows CASCADE only on the audited allowlist", () => {
    expect(cascadeEdges()).toEqual([...EXPECTED_CASCADES].sort());
  });

  it("guards every financial-history table with RESTRICT or SET NULL", () => {
    const protectedTables = [
      "finance_projects",
      "finance_households",
      "finance_household_members",
      "finance_shared_budgets",
      "finance_shared_expenses",
      "finance_voucher_settings",
      "finance_vouchers",
      "finance_ledger_entries",
      "finance_journal_entries",
      "finance_voucher_audit",
      "finance_chart_of_accounts",
      "finance_account_groups",
      "finance_fiscal_periods",
      "finance_period_locks",
      "finance_voucher_reversals",
      "finance_bank_reconciliations",
      "finance_accounts",
      "finance_categories",
      "finance_transactions",
      "finance_dues",
      "finance_due_settlements",
      "finance_budgets",
      "finance_bills",
      "finance_recurring_transactions",
      "audit_logs",
      "finance_private_storage_objects",
      "finance_invoices",
      "finance_inventory_items",
      "finance_employees",
      "finance_salary_payments",
      "finance_employee_advances",
    ];
    const violations: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, MySqlTable)) continue;
      const config = getTableConfig(value);
      if (!protectedTables.includes(config.name)) continue;
      for (const fk of config.foreignKeys) {
        if (fk.onDelete !== "restrict" && fk.onDelete !== "set null") {
          const ref = fk.reference();
          violations.push(
            `${config.name}.${ref.columns.map(column => column.name).join(",")} onDelete=${fk.onDelete ?? "default"}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
