import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildLifecycleReport,
  buildMaintenanceReport,
  buildOutputs,
  evaluateRun,
  hasActionableFindings,
  summarizeAudit,
  summarizeRepository,
} from "./maintenance-report.mjs";

const NOW = Date.parse("2026-10-22T06:15:00.000Z");

function run(overrides = {}) {
  return {
    conclusion: "success",
    status: "completed",
    createdAt: "2026-10-22T05:00:00.000Z",
    url: "https://example.test/run/1",
    ...overrides,
  };
}

function auditPayload(counts, advisories = {}) {
  return {
    metadata: { vulnerabilities: counts },
    advisories,
  };
}

function baseData(overrides = {}) {
  return {
    meta: {
      generatedAt: "2026-10-22T06:15:00.000Z",
      repository: "Rossy0109/Money_Tracker",
      runUrl: "https://example.test/run/1",
      appUrl: "https://money-tracker-blond-pi.vercel.app",
      branch: "main",
    },
    ci: {
      run: run({ createdAt: "2026-10-21T06:00:00.000Z" }),
      jobs: [],
    },
    workflows: {
      backup: run({ createdAt: "2026-10-22T04:00:00.000Z" }),
      restoreDrill: run({ createdAt: "2026-10-19T05:00:00.000Z" }),
      accountingAudit: run({ createdAt: "2026-10-22T05:30:00.000Z" }),
      healthWatch: run({ createdAt: "2026-10-22T06:00:00.000Z" }),
    },
    audit: auditPayload({ critical: 0, high: 0, moderate: 2, low: 1 }),
    repo: { issues: [], pulls: [] },
    migration: {
      latestTag: "0022_drop_drive_connections",
      latestWhen: 1792536248636,
      productionState: "UNKNOWN",
    },
    ...overrides,
  };
}

describe("summarizeAudit", () => {
  it("reads npm-audit metadata counts", () => {
    const result = summarizeAudit(
      auditPayload({ critical: 1, high: 2, moderate: 3, low: 4, info: 0 })
    );
    expect(result.available).toBe(true);
    expect(result.counts).toEqual({
      critical: 1,
      high: 2,
      moderate: 3,
      low: 4,
      info: 0,
    });
    expect(result.total).toBe(10);
  });

  it("derives counts from advisories when metadata is absent", () => {
    const result = summarizeAudit({
      advisories: {
        1: { severity: "high", module_name: "a", title: "A" },
        2: { severity: "high", module_name: "b", title: "B" },
        3: { severity: "low", module_name: "c", title: "C" },
        4: { severity: "weird", module_name: "d", title: "D" },
      },
    });
    expect(result.available).toBe(true);
    expect(result.counts.high).toBe(2);
    expect(result.counts.low).toBe(1);
    expect(result.counts.info).toBe(1);
  });

  it("returns unavailable for an empty or malformed payload", () => {
    expect(summarizeAudit(null)).toMatchObject({ available: false });
    expect(summarizeAudit([])).toMatchObject({ available: false });
    expect(summarizeAudit({})).toMatchObject({ available: false });
  });

  it("sorts the top advisories by severity and caps them at five", () => {
    const advisories = {};
    for (let i = 0; i < 7; i += 1) {
      advisories[i] = {
        severity: i < 3 ? "critical" : "moderate",
        module_name: `m${i}`,
        title: `t${i}`,
        url: `https://example.test/${i}`,
      };
    }
    const result = summarizeAudit({ advisories });
    expect(result.top).toHaveLength(5);
    expect(result.top[0].severity).toBe("critical");
    expect(result.top[4].severity).toBe("moderate");
  });
});

describe("evaluateRun", () => {
  it("returns UNKNOWN when no run exists", () => {
    expect(evaluateRun(null, { now: NOW })).toMatchObject({
      state: "UNKNOWN",
      ageHours: null,
    });
  });

  it("returns RUNNING for an in-progress run", () => {
    expect(
      evaluateRun(run({ status: "in_progress", conclusion: null }), { now: NOW })
    ).toMatchObject({ state: "RUNNING" });
  });

  it("returns FAIL for a non-success conclusion", () => {
    expect(evaluateRun(run({ conclusion: "failure" }), { now: NOW })).toMatchObject(
      { state: "FAIL" }
    );
  });

  it("returns UNKNOWN when a success has no parseable timestamp", () => {
    expect(
      evaluateRun(run({ createdAt: "not-a-date" }), { now: NOW })
    ).toMatchObject({ state: "UNKNOWN", ageHours: null });
  });

  it("returns STALE beyond the age limit", () => {
    const result = evaluateRun(
      run({ createdAt: "2026-10-20T06:00:00.000Z" }),
      { now: NOW, maxAgeHours: 24 }
    );
    expect(result.state).toBe("STALE");
    expect(result.ageHours).toBeCloseTo(48.25, 2);
  });

  it("returns PASS for a fresh success", () => {
    expect(evaluateRun(run(), { now: NOW })).toMatchObject({ state: "PASS" });
  });
});

describe("summarizeRepository", () => {
  it("excludes this workflow's own issue and counts Dependabot PRs", () => {
    const result = summarizeRepository(
      {
        issues: [
          { number: 1, title: "Automated maintenance report" },
          { number: 2, title: "Real bug" },
        ],
        pulls: [
          { number: 3, headRefName: "dependabot/npm_and_yarn/x" },
          { number: 4, headRefName: "feature/y" },
        ],
      },
      "Automated maintenance report"
    );
    expect(result.openIssues).toBe(1);
    expect(result.ownIssueOpen).toBe(true);
    expect(result.dependabotPulls).toBe(1);
    expect(result.openPulls).toBe(2);
  });

  it("tolerates missing arrays", () => {
    expect(summarizeRepository(null, "x")).toMatchObject({
      openIssues: 0,
      openPulls: 0,
      dependabotPulls: 0,
    });
  });
});

describe("buildMaintenanceReport", () => {
  it("renders every scheduled check and the production UNKNOWN", () => {
    const report = buildMaintenanceReport(baseData());
    expect(report).toContain("Daily backup | PASS");
    expect(report).toContain("Weekly restore drill | PASS");
    expect(report).toContain("Accounting audit | PASS");
    expect(report).toContain("Dependency audit | PASS");
    expect(report).toContain("Production state: UNKNOWN");
    expect(report).toContain("No actionable failures detected");
  });

  it("marks a failed backup as action required", () => {
    const report = buildMaintenanceReport(
      baseData({
        workflows: {
          ...baseData().workflows,
          backup: run({ conclusion: "failure" }),
        },
      })
    );
    expect(report).toContain("Daily backup | FAIL");
    expect(report).toContain("ACTION REQUIRED");
  });

  it("renders top advisories without leaking anything but the advisory metadata", () => {
    const report = buildMaintenanceReport(
      baseData({
        audit: {
          metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0 } },
          advisories: {
            1: {
              severity: "critical",
              module_name: "tar",
              title: "tar DoS",
              url: "https://example.test/adv",
            },
          },
        },
      })
    );
    expect(report).toContain("| critical | tar |");
    expect(report).toContain("Dependency audit | FAIL");
  });

  it("reports BLOCKED when the audit payload is unusable", () => {
    const report = buildMaintenanceReport(baseData({ audit: null }));
    expect(report).toContain("Dependency audit | BLOCKED");
  });
});

describe("buildLifecycleReport", () => {
  it("lists failed CI jobs and owner decisions", () => {
    const report = buildLifecycleReport(
      baseData({
        ci: {
          run: run({ conclusion: "failure", createdAt: "2026-10-21T06:00:00.000Z" }),
          jobs: [
            { name: "verify", conclusion: "success" },
            { name: "browser-e2e", conclusion: "failure" },
          ],
        },
      })
    );
    expect(report).toContain("browser-e2e: failure");
    expect(report).toContain("Required owner decisions");
    expect(report).toContain("0022_drop_drive_connections");
    expect(report).toContain("Production migration state: UNKNOWN");
  });

  it("marks the audit as UNKNOWN rather than zero when unavailable", () => {
    const report = buildLifecycleReport(baseData({ audit: null }));
    expect(report).toContain("UNKNOWN — `pnpm audit --json`");
  });

  it("asks for restore-drill verification when the drill is stale", () => {
    const report = buildLifecycleReport(
      baseData({
        workflows: {
          ...baseData().workflows,
          restoreDrill: run({ createdAt: "2026-10-01T05:00:00.000Z" }),
        },
      })
    );
    expect(report).toContain("Verify backup recoverability");
  });
});

describe("hasActionableFindings", () => {
  it("is false for a fully green report", () => {
    expect(hasActionableFindings(baseData())).toBe(false);
  });

  it("is true for a failed CI run", () => {
    expect(
      hasActionableFindings(
        baseData({
          ci: {
            run: run({ conclusion: "failure", createdAt: "2026-10-21T06:00:00.000Z" }),
            jobs: [],
          },
        })
      )
    ).toBe(true);
  });

  it("is true for a stale backup", () => {
    expect(
      hasActionableFindings(
        baseData({
          workflows: {
            ...baseData().workflows,
            backup: run({ createdAt: "2026-10-19T04:00:00.000Z" }),
          },
        })
      )
    ).toBe(true);
  });

  it("is true when the audit is blocked", () => {
    expect(hasActionableFindings(baseData({ audit: null }))).toBe(true);
  });

  it("is true for critical or high advisories", () => {
    expect(
      hasActionableFindings(
        baseData({
          audit: auditPayload({ critical: 0, high: 1, moderate: 0, low: 0 }),
        })
      )
    ).toBe(true);
  });

  it("ignores health-watch failures because it owns its own issue", () => {
    expect(
      hasActionableFindings(
        baseData({
          workflows: {
            ...baseData().workflows,
            healthWatch: run({ conclusion: "failure" }),
          },
        })
      )
    ).toBe(false);
  });

  it("does not treat an in-progress run as actionable", () => {
    expect(
      hasActionableFindings(
        baseData({
          workflows: {
            ...baseData().workflows,
            backup: run({ status: "in_progress", conclusion: null }),
          },
        })
      )
    ).toBe(false);
  });
});

describe("buildOutputs", () => {
  it("emits actionable and a compact summary", () => {
    expect(buildOutputs(baseData())).toEqual({
      actionable: "false",
      summary: "ci=PASS backup=PASS audit=0c/0h/2m",
    });
  });
});

describe("CLI", () => {
  it("writes both reports and the GitHub outputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "maintenance-report-"));
    const input = join(dir, "input");
    const out = join(dir, "out");
    const ghOutput = join(dir, "output.txt");
    mkdirSync(input, { recursive: true });
    writeFileSync(join(input, "meta.json"), JSON.stringify(baseData().meta));
    writeFileSync(join(input, "ci-run.json"), JSON.stringify(baseData().ci.run));
    writeFileSync(join(input, "ci-jobs.json"), JSON.stringify({ jobs: [] }));
    writeFileSync(
      join(input, "workflows.json"),
      JSON.stringify(baseData().workflows)
    );
    writeFileSync(join(input, "audit.json"), JSON.stringify(baseData().audit));
    writeFileSync(join(input, "issues.json"), "[]");
    writeFileSync(join(input, "pulls.json"), "[]");
    writeFileSync(
      join(input, "migration.json"),
      JSON.stringify(baseData().migration)
    );

    const result = spawnSync(
      process.execPath,
      [
        "scripts/maintenance-report.mjs",
        "--input-dir",
        input,
        "--out-dir",
        out,
        "--github-output",
        ghOutput,
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(readFileSync(join(out, "maintenance-report.md"), "utf8")).toContain(
      "Automated maintenance report"
    );
    expect(readFileSync(join(out, "lifecycle-report.md"), "utf8")).toContain(
      "Lifecycle report"
    );
    expect(readFileSync(ghOutput, "utf8")).toContain("actionable=false");
  });
});
