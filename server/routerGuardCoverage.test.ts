/**
 * BR-1 — router-wide guard coverage.
 *
 * Every tRPC procedure must start from a named guard factory, so a finance
 * query or mutation can never regress to a bare `protectedProcedure` (any
 * authenticated user) or `publicProcedure` by accident. This mirrors the
 * workflow-hardening gate: a static scan of the router sources that fails the
 * build when an unguarded (or un-allowlisted) procedure appears.
 *
 * Guard families:
 *  - PERMISSION_GUARDS carry an RBAC resource permission — always acceptable.
 *  - BASE_GUARDS only authenticate (or do nothing). They are acceptable only
 *    for the explicit allowlist below, each entry with its justification.
 *
 * If a legitimate new base-guarded procedure appears, add it to the allowlist
 * *in the same commit* with a reason — that review is the point of BR-1.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "./routers.ts",
  "./routers/auth.ts",
  "./_core/systemRouter.ts",
] as const;

/** Procedure starters that enforce a resource permission (or admin gate). */
const PERMISSION_GUARDS = new Set([
  "protectedWithPermission",
  "inputOnlyWithPermission",
  "protectedWithAnyPermission",
  "inputOnlyWithAnyPermission",
  "adminProcedure",
  "elevatedAdminProcedure",
]);

/** Procedure starters that only authenticate (or not at all). */
const BASE_GUARDS = new Set([
  "publicProcedure",
  "protectedProcedure",
  "inputOnlyProcedure",
]);

/**
 * Base-guarded procedures that are accepted by design (file#key).
 *
 * Queries:
 *  - systemRouter#health       — liveness probe, returns no data.
 *  - systemRouter#healthReport — authenticated report; no resource model
 *                                exists for system health.
 *  - routers/auth.ts#me        — session introspection; returns only the
 *                                caller's own identity.
 * Mutations:
 *  - register/login            — must run before a session exists; rate-limited.
 *  - logout                    — must clear even an expired/broken session.
 *  - forgotPassword/resetPassword — credential recovery; rate-limited and
 *                                single-use by construction.
 *  - setPassword               — authenticated + input-only gate
 *                                (inputOnlyProcedure); changes only the
 *                                caller's own password, so no resource
 *                                permission applies.
 */
const ALLOWED_BASE = new Set([
  "./_core/systemRouter.ts#health",
  "./_core/systemRouter.ts#healthReport",
  "./routers/auth.ts#me",
  "./routers/auth.ts#register",
  "./routers/auth.ts#login",
  "./routers/auth.ts#logout",
  "./routers/auth.ts#forgotPassword",
  "./routers/auth.ts#resetPassword",
  "./routers/auth.ts#setPassword",
]);

interface ProcedureFinding {
  file: string;
  key: string;
  starter: string;
  kind: "query" | "mutation";
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function scanFile(file: string): ProcedureFinding[] {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const lines = source.split("\n");
  const findings: ProcedureFinding[] = [];

  lines.forEach((line, index) => {
    const anchor = line.search(/\.(query|mutation)\s*[<(]/);
    if (anchor === -1) return;
    const kind = line.slice(anchor).startsWith(".query") ? "query" : "mutation";
    const anchorIndent = indentOf(line);

    // The chain may start on this very line: `key: GUARD(...).mutation(...)`.
    const own = line.match(
      /^(\s*)([A-Za-z_$][\w$]*):\s*([A-Za-z_$][\w$]*)/
    );
    if (own && indentOf(own[1]) === anchorIndent) {
      findings.push({ file, key: own[2], starter: own[3], kind });
      return;
    }

    // Otherwise walk backwards to the procedure's `key: STARTER` line. Deeper
    // indents belong to zod schemas inside .input() — skip them. The first
    // shallower-or-equal key line must name a known starter, otherwise the
    // chain begins somewhere this scanner does not understand (a violation,
    // so new factories get added deliberately).
    for (let i = index - 1; i >= 0; i--) {
      const candidate = lines[i]!;
      if (indentOf(candidate) >= anchorIndent) continue;
      const match = candidate.match(
        /^(\s*)([A-Za-z_$][\w$]*):\s*([A-Za-z_$][\w$]*)/
      );
      if (!match) continue;
      findings.push({ file, key: match[2], starter: match[3], kind });
      return;
    }
  });

  return findings;
}

describe("BR-1 router guard coverage", () => {
  const findings = FILES.flatMap(file => scanFile(file));

  it("scans a non-trivial number of procedures (scanner is live)", () => {
    // ~139 procedures across the three router sources at the time of writing.
    expect(findings.length).toBeGreaterThanOrEqual(130);
  });

  it("every mutation carries a permission guard or an allowlisted exception", () => {
    const violations = findings
      .filter(finding => finding.kind === "mutation")
      .filter(finding => {
        if (PERMISSION_GUARDS.has(finding.starter)) return false;
        if (
          BASE_GUARDS.has(finding.starter) &&
          ALLOWED_BASE.has(`${finding.file}#${finding.key}`)
        )
          return false;
        return true;
      });
    expect(violations).toEqual([]);
  });

  it("every query carries a permission guard or an allowlisted exception", () => {
    const violations = findings
      .filter(finding => finding.kind === "query")
      .filter(finding => {
        if (PERMISSION_GUARDS.has(finding.starter)) return false;
        if (
          BASE_GUARDS.has(finding.starter) &&
          ALLOWED_BASE.has(`${finding.file}#${finding.key}`)
        )
          return false;
        return true;
      });
    expect(violations).toEqual([]);
  });

  it("recognizes the known guard factories (no unknown chain starters)", () => {
    const unknown = findings.filter(
      finding =>
        !PERMISSION_GUARDS.has(finding.starter) &&
        !BASE_GUARDS.has(finding.starter)
    );
    expect(unknown).toEqual([]);
  });

  it("pinned: sensitive finance mutations use permission guards", () => {
    // Spot-checks the audit called out — these must never fall back to a
    // bare base procedure even if someone rewrites the allowlist.
    const spotChecks = [
      { file: "./routers.ts", key: "submitVoucher" },
      { file: "./routers.ts", key: "approveVoucher" },
      { file: "./routers.ts", key: "postVoucher" },
    ];
    for (const spot of spotChecks) {
      const finding = findings.find(
        f => f.file === spot.file && f.key === spot.key
      );
      expect(finding, `missing procedure ${spot.key}`).toBeDefined();
      expect(PERMISSION_GUARDS.has(finding!.starter)).toBe(true);
    }
  });
});
