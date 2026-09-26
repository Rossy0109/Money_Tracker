/**
 * Self-Approval Prevention Tests — Phase 16A.
 *
 * Invariant enforced:
 *   creator_user_id != approver_user_id
 *   creator_user_id != poster_user_id
 *   creator_user_id != reversal_actor_user_id
 *
 * No user (including ADMIN/SUPER_ADMIN) may approve, post, or reverse
 * a voucher they themselves created.
 *
 * All tests verify source code invariants — no db mocking needed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { flattenSource } from "@shared/sourceText";

function readFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function getFunctionBody(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}(`);
  if (start === -1) throw new Error(`Function ${fnName} not found`);
  const end = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

// ─── Source code enforcement tests ───────────────────────────────────────────

describe("Self-Approval Prevention — Source Code Enforcement", () => {
  let dbSource: string;

  it("loads db.ts source", () => {
    dbSource = readFile("./db.ts");
    expect(dbSource.length).toBeGreaterThan(0);
  });

  it("approveVoucher contains self-approval guard with Bengali error", () => {
    expect(dbSource).toContain("নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না");
  });

  it("postVoucher contains self-posting guard with Bengali error", () => {
    expect(dbSource).toContain("নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না");
  });

  it("reverseVoucher contains self-reversal guard with Bengali error", () => {
    expect(dbSource).toContain("নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না");
  });

  it("createVoucherWithEntries blocks direct posted creation", () => {
    expect(dbSource).toContain("সরাসরি পোস্ট করা ভাউচার তৈরি করা যাবে না");
  });

  it("_internalPostedBy bypass exists for reversal flow", () => {
    expect(dbSource).toContain("_internalPostedBy");
  });
});

// ─── Structural invariants ───────────────────────────────────────────────────

describe("Self-Approval Prevention — Structural Invariants", () => {
  const dbSource = readFile("./db.ts");

  it("approveVoucher self-check only applies to 'approve' action (not 'return')", () => {
    const fn = getFunctionBody(dbSource, "approveVoucher");
    expect(fn).toContain('action === "approve" && voucher.userId === userId');
  });

  it("postVoucher self-check is before db.transaction", () => {
    const fn = getFunctionBody(dbSource, "postVoucher");
    const selfCheckPos = fn.indexOf("নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না");
    const transactionPos = fn.indexOf("db.transaction");
    expect(selfCheckPos).toBeGreaterThan(0);
    expect(transactionPos).toBeGreaterThan(0);
    expect(selfCheckPos).toBeLessThan(transactionPos);
  });

  it("reverseVoucher self-check is before db.transaction", () => {
    const fn = getFunctionBody(dbSource, "reverseVoucher");
    const selfCheckPos = fn.indexOf(
      "নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না"
    );
    const transactionPos = fn.indexOf("db.transaction");
    expect(selfCheckPos).toBeGreaterThan(0);
    expect(transactionPos).toBeGreaterThan(0);
    expect(selfCheckPos).toBeLessThan(transactionPos);
  });

  it("no admin bypass in approveVoucher", () => {
    const fn = getFunctionBody(dbSource, "approveVoucher");
    expect(fn).not.toMatch(/\b(ADMIN|superAdmin|SUPER_ADMIN)\b/);
  });

  it("no admin bypass in postVoucher", () => {
    const fn = getFunctionBody(dbSource, "postVoucher");
    expect(fn).not.toMatch(/\b(ADMIN|superAdmin|SUPER_ADMIN)\b/);
  });

  it("no admin bypass in reverseVoucher", () => {
    const fn = getFunctionBody(dbSource, "reverseVoucher");
    expect(fn).not.toMatch(/\b(ADMIN|superAdmin|SUPER_ADMIN)\b/);
  });

  it("all three functions perform the self-check after fetching voucher but before any mutation", () => {
    // approveVoucher: fetch → self-check → assertVoucherTransition → update
    const approveFn = getFunctionBody(dbSource, "approveVoucher");
    const approveFetch = approveFn.indexOf(".limit(1)");
    const approveCheck = approveFn.indexOf(
      "নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না"
    );
    const approveUpdate = approveFn.indexOf("update(");
    expect(approveFetch).toBeLessThan(approveCheck);
    expect(approveCheck).toBeLessThan(approveUpdate);

    // postVoucher: fetch → self-check → assertVoucherTransition → transaction
    const postFn = getFunctionBody(dbSource, "postVoucher");
    const postFetch = postFn.indexOf(".limit(1)");
    const postCheck = postFn.indexOf(
      "নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না"
    );
    const postTransaction = postFn.indexOf("db.transaction");
    expect(postFetch).toBeLessThan(postCheck);
    expect(postCheck).toBeLessThan(postTransaction);

    // reverseVoucher: fetch → self-check → assertVoucherTransition → transaction
    const reverseFn = getFunctionBody(dbSource, "reverseVoucher");
    const reverseFetch = reverseFn.indexOf(".limit(1)");
    const reverseCheck = reverseFn.indexOf(
      "নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না"
    );
    const reverseTransaction = reverseFn.indexOf("db.transaction");
    expect(reverseFetch).toBeLessThan(reverseCheck);
    expect(reverseCheck).toBeLessThan(reverseTransaction);
  });
});

// ─── Router-level enforcement ────────────────────────────────────────────────

describe("Self-Approval Prevention — Router-Level Enforcement", () => {
  const routerSource = readFile("./routers.ts");

  it("approveVoucher procedure uses permission-based middleware (not owner-only)", () => {
    expect(routerSource).toContain(
      'inputOnlyWithPermission("voucher", "approve")'
    );
  });

  it("postVoucher procedure uses permission-based middleware", () => {
    // postVoucher should also be protected by RBAC
    expect(routerSource).toContain(
      'inputOnlyWithPermission("voucher", "post")'
    );
  });
});

// ─── Schema completeness ─────────────────────────────────────────────────────

describe("Self-Approval Prevention — Schema Completeness", () => {
  const schemaSource = readFile("../drizzle/schema.ts");

  it("financeVouchers has userId (creator) column", () => {
    expect(schemaSource).toMatch(/userId.*int.*userId/);
  });

  it("financeVouchers has submittedBy column", () => {
    expect(schemaSource).toContain("submittedBy");
  });

  it("financeVouchers has approvedBy column", () => {
    expect(schemaSource).toContain("approvedBy");
  });

  it("financeVouchers has postedBy column", () => {
    expect(schemaSource).toContain("postedBy");
  });

  it("financeVouchers has reversedBy column", () => {
    expect(schemaSource).toContain("reversedBy");
  });

  it("submittedBy, approvedBy, postedBy, reversedBy are nullable (set via workflow)", () => {
    // These columns should be nullable because they're set as the voucher progresses
    // Compared against whitespace-collapsed schema text: the column
    // declaration is wrapped across lines, which `.*` cannot span.
    const flattenedSchema = flattenSource(schemaSource);
    expect(flattenedSchema).toMatch(
      /submittedBy.*int.*submittedBy.*references.*set null/
    );
    expect(flattenedSchema).toMatch(
      /approvedBy.*int.*approvedBy.*references.*set null/
    );
    expect(flattenedSchema).toMatch(
      /postedBy.*int.*postedBy.*references.*set null/
    );
    expect(flattenedSchema).toMatch(
      /reversedBy.*int.*reversedBy.*references.*set null/
    );
  });
});
