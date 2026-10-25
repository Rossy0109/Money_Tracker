#!/usr/bin/env node
/**
 * Maintenance + lifecycle report generator.
 *
 * Pure renderers live here (not in the workflow YAML) so the logic can be unit
 * tested without GitHub, the network, or a database. The CLI reads the JSON
 * evidence collected by `.github/workflows/maintenance-report.yml` and writes
 * two Markdown artifacts plus `actionable` / `summary` GitHub outputs.
 *
 * Safety rules baked into this file:
 *   - only status metadata is rendered — never tokens, URLs with credentials,
 *     or financial rows;
 *   - anything that could not be verified is printed as UNKNOWN / BLOCKED,
 *     never as PASS;
 *   - production migration state is never inferred from the repository.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const SEVERITIES = ["critical", "high", "moderate", "low", "info"];

const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  info: 4,
};

const HOUR_MS = 60 * 60 * 1000;

/** Coerce a value to a finite number, or null. */
function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise `pnpm audit --json` output.
 *
 * pnpm 9 emits npm-audit-shaped JSON (`metadata.vulnerabilities` plus an
 * `advisories` map). Older/partial payloads may omit `metadata`, so counts are
 * derived from `advisories` as a fallback. A payload that is neither shape is
 * reported as unavailable — never as "0 vulnerabilities".
 */
export function summarizeAudit(audit) {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    return { available: false, counts: null, total: null, top: [] };
  }

  const advisories =
    audit.advisories && typeof audit.advisories === "object"
      ? Object.values(audit.advisories)
      : [];

  const metadata = audit.metadata?.vulnerabilities;
  let counts = null;
  if (metadata && typeof metadata === "object") {
    counts = {};
    for (const severity of SEVERITIES) {
      counts[severity] = finite(metadata[severity]) ?? 0;
    }
  } else if (advisories.length > 0) {
    counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    for (const advisory of advisories) {
      const severity = String(advisory?.severity ?? "info").toLowerCase();
      if (counts[severity] === undefined) counts.info += 1;
      else counts[severity] += 1;
    }
  }

  if (!counts) {
    return { available: false, counts: null, total: null, top: [] };
  }

  const top = advisories
    .map((advisory) => ({
      severity: String(advisory?.severity ?? "info").toLowerCase(),
      module: advisory?.module_name ?? advisory?.module ?? "unknown",
      title: advisory?.title ?? advisory?.name ?? "security advisory",
      url: typeof advisory?.url === "string" ? advisory.url : "",
    }))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        a.module.localeCompare(b.module)
    )
    .slice(0, 5);

  return {
    available: true,
    counts,
    total: SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0),
    top,
  };
}

/**
 * Classify a GitHub Actions run.
 *
 * `PASS` requires a completed, successful run that is newer than the allowed
 * age. A missing run is UNKNOWN (never PASS). An in-progress run is RUNNING
 * (not actionable on its own).
 */
export function evaluateRun(run, { now = Date.now(), maxAgeHours = 30 } = {}) {
  if (!run || typeof run !== "object") {
    return { state: "UNKNOWN", ageHours: null, detail: "no run recorded" };
  }

  const createdAt = Date.parse(run.createdAt);
  const ageHours = Number.isFinite(createdAt)
    ? (now - createdAt) / HOUR_MS
    : null;

  if (run.status && run.status !== "completed") {
    return {
      state: "RUNNING",
      ageHours,
      detail: `run ${run.status}`,
    };
  }

  if (run.conclusion !== "success") {
    return {
      state: "FAIL",
      ageHours,
      detail: `conclusion ${run.conclusion ?? "unknown"}`,
    };
  }

  if (ageHours === null) {
    return {
      state: "UNKNOWN",
      ageHours,
      detail: "success, but the timestamp could not be parsed",
    };
  }

  if (ageHours > maxAgeHours) {
    return {
      state: "STALE",
      ageHours,
      detail: `last success ${ageHours.toFixed(1)}h ago (limit ${maxAgeHours}h)`,
    };
  }

  return {
    state: "PASS",
    ageHours,
    detail: `success ${ageHours.toFixed(1)}h ago`,
  };
}

/** Count open issues/PRs without treating this workflow's own issue as new. */
export function summarizeRepository(repo, ownIssueTitle) {
  const issues = Array.isArray(repo?.issues) ? repo.issues : [];
  const pulls = Array.isArray(repo?.pulls) ? repo.pulls : [];

  const own = issues.filter((issue) => issue?.title === ownIssueTitle);
  const otherIssues = issues.filter((issue) => issue?.title !== ownIssueTitle);
  const dependabotPulls = pulls.filter((pull) =>
    String(pull?.headRefName ?? "").startsWith("dependabot/")
  );

  return {
    openIssues: otherIssues.length,
    ownIssueOpen: own.length > 0,
    openPulls: pulls.length,
    dependabotPulls: dependabotPulls.length,
    issueList: otherIssues.slice(0, 10),
    pullList: pulls.slice(0, 10),
  };
}

function fmtAge(hours) {
  if (hours === null || hours === undefined) return "unknown";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function statusRow(label, evaluated, extra = "") {
  const detail = [evaluated.detail, extra].filter(Boolean).join(" — ");
  return `| ${label} | ${evaluated.state} | ${detail} |`;
}

function runLink(run) {
  if (!run?.url) return "";
  return `([run](${run.url}))`;
}

/**
 * Build the concise maintenance report (daily artifact + issue body).
 */
export function buildMaintenanceReport(data) {
  const meta = data?.meta ?? {};
  const now = Date.parse(meta.generatedAt) || Date.now();
  const workflows = data?.workflows ?? {};

  const checks = [
    ["Daily backup", evaluateRun(workflows.backup, { now, maxAgeHours: 30 })],
    [
      "Weekly restore drill",
      evaluateRun(workflows.restoreDrill, { now, maxAgeHours: 8 * 24 }),
    ],
    [
      "Accounting audit",
      evaluateRun(workflows.accountingAudit, { now, maxAgeHours: 30 }),
    ],
    [
      "Production health watch",
      evaluateRun(workflows.healthWatch, { now, maxAgeHours: 3 }),
    ],
  ];

  const audit = summarizeAudit(data?.audit);
  let auditState;
  if (!audit.available) {
    auditState = { state: "BLOCKED", detail: "pnpm audit returned no parsable report" };
  } else if (audit.counts.critical > 0 || audit.counts.high > 0) {
    auditState = {
      state: "FAIL",
      detail: `${audit.counts.critical} critical, ${audit.counts.high} high, ${audit.counts.moderate} moderate, ${audit.counts.low} low`,
    };
  } else {
    auditState = {
      state: "PASS",
      detail: `no critical/high advisories (${audit.counts.moderate} moderate, ${audit.counts.low} low)`,
    };
  }

  const repo = summarizeRepository(data?.repo, "Automated maintenance report");
  const migration = data?.migration ?? {};

  const lines = [
    "## Automated maintenance report",
    "",
    `Generated: ${meta.generatedAt ?? "unknown"}`,
    `Repository: ${meta.repository ?? "unknown"}`,
    `Workflow run: ${meta.runUrl ?? "unknown"}`,
    "",
    "### Scheduled checks",
    "",
    "| Check | State | Detail |",
    "| --- | --- | --- |",
    ...checks.map(([label, evaluated]) => statusRow(label, evaluated)),
    statusRow("Dependency audit", auditState),
    "",
    "### Repository state",
    "",
    `- Open issues (excluding this report): ${repo.openIssues}`,
    `- Open pull requests: ${repo.openPulls} (Dependabot: ${repo.dependabotPulls})`,
    "",
  ];

  if (audit.available && audit.top.length > 0) {
    lines.push("### Top dependency advisories", "");
    lines.push("| Severity | Module | Advisory |");
    lines.push("| --- | --- | --- |");
    for (const advisory of audit.top) {
      const title = advisory.url
        ? `[${advisory.title}](${advisory.url})`
        : advisory.title;
      lines.push(`| ${advisory.severity} | ${advisory.module} | ${title} |`);
    }
    lines.push("");
  }

  lines.push(
    "### Production migration",
    "",
    `- Repository journal head: ${migration.latestTag ?? "unknown"}`,
    `- Production state: ${migration.productionState ?? "UNKNOWN"} — this workflow never connects to production.`,
    "- Owner approval is required before any production migration is applied.",
    ""
  );

  const actionable = hasActionableFindings(data);
  lines.push(
    "### Verdict",
    "",
    actionable
      ? "ACTION REQUIRED — one or more checks failed, went stale, or could not be verified."
      : "No actionable failures detected. Health watch manages its own outage issue.",
    ""
  );

  return lines.join("\n");
}

/**
 * Build the lifecycle summary. Unlike the maintenance report, this also names
 * the owner decisions that are blocking a fully automated lifecycle.
 */
export function buildLifecycleReport(data) {
  const meta = data?.meta ?? {};
  const now = Date.parse(meta.generatedAt) || Date.now();
  const workflows = data?.workflows ?? {};
  const audit = summarizeAudit(data?.audit);
  const repo = summarizeRepository(data?.repo, "Automated maintenance report");
  const migration = data?.migration ?? {};

  const ciRun = data?.ci?.run ?? null;
  const ci = evaluateRun(ciRun, { now, maxAgeHours: 14 * 24 });
  const failedJobs = Array.isArray(data?.ci?.jobs)
    ? data.ci.jobs.filter((job) => job?.conclusion && job.conclusion !== "success")
    : [];

  const backup = evaluateRun(workflows.backup, { now, maxAgeHours: 30 });
  const restore = evaluateRun(workflows.restoreDrill, {
    now,
    maxAgeHours: 8 * 24,
  });
  const accounting = evaluateRun(workflows.accountingAudit, {
    now,
    maxAgeHours: 30,
  });
  const health = evaluateRun(workflows.healthWatch, { now, maxAgeHours: 3 });

  const ownerDecisions = [];
  ownerDecisions.push(
    `Confirm whether \`${migration.latestTag ?? "the latest migration"}\` is applied in production and approve it explicitly if not (see docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md).`
  );
  if (audit.available && (audit.counts.critical > 0 || audit.counts.high > 0)) {
    ownerDecisions.push(
      `Decide how to remediate ${audit.counts.critical} critical / ${audit.counts.high} high dependency advisories (DEPENDENCY-POLICY.md).`
    );
  }
  if (!audit.available) {
    ownerDecisions.push(
      "Restore dependency-audit visibility: `pnpm audit --json` did not return a parsable report."
    );
  }
  if (restore.state !== "PASS") {
    ownerDecisions.push(
      "Verify backup recoverability: the latest restore drill is not a fresh success."
    );
  }
  if (repo.dependabotPulls > 0) {
    ownerDecisions.push(
      `Review ${repo.dependabotPulls} open Dependabot pull request(s); majors require approval.`
    );
  }

  const lines = [
    "## Lifecycle report",
    "",
    `Generated: ${meta.generatedAt ?? "unknown"}`,
    `Repository: ${meta.repository ?? "unknown"}`,
    `Workflow run: ${meta.runUrl ?? "unknown"}`,
    `Target: ${meta.appUrl ?? "unknown"}`,
    "",
    "### Verified facts",
    "",
    "| Area | State | Detail |",
    "| --- | --- | --- |",
    statusRow(
      "Latest CI on main",
      ci,
      ciRun?.headSha ? `commit ${String(ciRun.headSha).slice(0, 7)}` : ""
    ),
    statusRow("Daily backup", backup),
    statusRow("Weekly restore drill", restore),
    statusRow("Accounting audit", accounting),
    statusRow("Production health watch", health),
    "",
    "### Failed CI checks",
    "",
    failedJobs.length === 0
      ? "- None reported by the latest CI run."
      : failedJobs
          .map((job) => `- ${job.name}: ${job.conclusion}`)
          .join("\n"),
    "",
    "### Dependency alerts",
    "",
    audit.available
      ? `- ${audit.counts.critical} critical, ${audit.counts.high} high, ${audit.counts.moderate} moderate, ${audit.counts.low} low (${audit.total} total).`
      : "- UNKNOWN — `pnpm audit --json` did not return a parsable report.",
    "",
    "### Backup and recovery",
    "",
    `- Latest daily backup: ${backup.state} (${backup.detail}) ${runLink(workflows.backup)}`,
    `- Latest restore drill: ${restore.state} (${restore.detail}) ${runLink(workflows.restoreDrill)}`,
    "- A backup is only labelled recoverable after an isolated restore drill passes; the weekly drill performs that restore and rolls it back.",
    "",
    "### Unresolved repository items",
    "",
    `- Open issues: ${repo.openIssues}`,
    `- Open pull requests: ${repo.openPulls} (Dependabot: ${repo.dependabotPulls})`,
    ...repo.issueList.map((issue) => `  - #${issue.number} ${issue.title}`),
    "",
    "### Required owner decisions",
    "",
    ...ownerDecisions.map((decision) => `- ${decision}`),
    "",
    "### Unverified (not PASS)",
    "",
    `- Production migration state: ${migration.productionState ?? "UNKNOWN"} — no production connection is made by automation.`,
    "- Production runtime logs: not collected (Vercel Hobby retains runtime logs for 1 hour).",
    "- Backup object contents: not inspected here; integrity is proven only by the restore drill.",
    "",
  ];

  return lines.join("\n");
}

/**
 * Actionable = a check a human must look at today. Health watch is excluded
 * because it opens and closes its own dedicated issue.
 */
export function hasActionableFindings(data) {
  const meta = data?.meta ?? {};
  const now = Date.parse(meta.generatedAt) || Date.now();
  const workflows = data?.workflows ?? {};
  const audit = summarizeAudit(data?.audit);

  const actionableStates = new Set(["FAIL", "STALE", "UNKNOWN", "BLOCKED"]);

  const backup = evaluateRun(workflows.backup, { now, maxAgeHours: 30 });
  const restore = evaluateRun(workflows.restoreDrill, {
    now,
    maxAgeHours: 8 * 24,
  });
  const accounting = evaluateRun(workflows.accountingAudit, {
    now,
    maxAgeHours: 30,
  });
  const ci = evaluateRun(data?.ci?.run, { now, maxAgeHours: 14 * 24 });

  if (ci.state === "FAIL" || ci.state === "UNKNOWN") return true;
  if (actionableStates.has(backup.state)) return true;
  if (actionableStates.has(restore.state)) return true;
  if (actionableStates.has(accounting.state)) return true;
  if (!audit.available) return true;
  if (audit.counts.critical > 0 || audit.counts.high > 0) return true;

  return false;
}

/** Build the GitHub Actions `actionable` + `summary` outputs. */
export function buildOutputs(data) {
  const meta = data?.meta ?? {};
  const now = Date.parse(meta.generatedAt) || Date.now();
  const audit = summarizeAudit(data?.audit);
  const backup = evaluateRun(data?.workflows?.backup, { now, maxAgeHours: 30 });
  const ci = evaluateRun(data?.ci?.run, { now, maxAgeHours: 14 * 24 });

  return {
    actionable: hasActionableFindings(data) ? "true" : "false",
    summary: [
      `ci=${ci.state}`,
      `backup=${backup.state}`,
      audit.available
        ? `audit=${audit.counts.critical}c/${audit.counts.high}h/${audit.counts.moderate}m`
        : "audit=BLOCKED",
    ].join(" "),
  };
}

function readJson(dir, name, fallback = null) {
  const path = join(dir, name);
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** CLI: `node scripts/maintenance-report.mjs --input-dir X --out-dir Y`. */
function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input-dir") args.set("input", argv[++i]);
    else if (argv[i] === "--out-dir") args.set("out", argv[++i]);
    else if (argv[i] === "--github-output") args.set("githubOutput", argv[++i]);
  }

  const inputDir = args.get("input");
  const outDir = args.get("out");
  if (!inputDir || !outDir) {
    console.error(
      "usage: node scripts/maintenance-report.mjs --input-dir <dir> --out-dir <dir> [--github-output <file>]"
    );
    process.exit(2);
  }

  const data = {
    meta: readJson(inputDir, "meta.json", {}),
    ci: {
      run: readJson(inputDir, "ci-run.json", null),
      jobs: readJson(inputDir, "ci-jobs.json", { jobs: [] })?.jobs ?? [],
    },
    workflows: readJson(inputDir, "workflows.json", {}),
    audit: readJson(inputDir, "audit.json", null),
    repo: {
      issues: readJson(inputDir, "issues.json", []),
      pulls: readJson(inputDir, "pulls.json", []),
    },
    migration: readJson(inputDir, "migration.json", {}),
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "maintenance-report.md"),
    `${buildMaintenanceReport(data)}\n`
  );
  writeFileSync(
    join(outDir, "lifecycle-report.md"),
    `${buildLifecycleReport(data)}\n`
  );

  const outputs = buildOutputs(data);
  const githubOutput = args.get("githubOutput");
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `actionable=${outputs.actionable}\nsummary=${outputs.summary}\n`
    );
  }
  console.log(`actionable=${outputs.actionable}`);
  console.log(`summary=${outputs.summary}`);
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main(process.argv.slice(2));
