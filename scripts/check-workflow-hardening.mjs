#!/usr/bin/env node
/**
 * Enforces the workflow-hardening invariants the pipeline applies to every
 * GitHub Actions file (see docs/GUARDIAN-REPORT.md):
 *
 *   - every workflow sets a top-level `permissions:` block (least privilege)
 *   - every workflow sets `concurrency:` (a pipeline cancels or queues)
 *   - every job sets `timeout-minutes:` (a hung job is not a cost centre)
 *   - every `uses:` ref is a full 40-char hex SHA (no mutable tags in CI)
 *   - every `actions/checkout` sets `persist-credentials: false`
 *     (except the documented allowlist — the dep-bump policy gate fetches the
 *     base ref with the checkout token)
 *
 * Unit-tested in scripts/check-workflow-hardening.test.ts; wired into CI's
 * `verify` gate so a future workflow edit cannot regress the posture.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Workflows allowed to keep persist-credentials on, each with the reason.
 */
export const PERSIST_CREDENTIALS_ALLOWLIST = new Map([
  [
    "dependency-bump-check.yml",
    "its policy gate runs `git fetch origin <base>` with the checkout token",
  ],
]);

/**
 * Split a workflow YAML into jobs keyed by job id, using indentation — a full
 * YAML parser would need a runtime dep and this repo pins its dependency set.
 */
function parseJobs(source) {
  const jobs = [];
  const jobsMatch = source.match(/^jobs:\n([\s\S]*)/m);
  if (!jobsMatch) return jobs;
  const lines = jobsMatch[1].split("\n");
  let current = null;
  for (const line of lines) {
    const m = line.match(/^  (\S[^:]*):\s*$/);
    if (m) {
      if (current) jobs.push({ id: current.id, body: current.bodyLines.join("\n") });
      current = { id: m[1], bodyLines: [line] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) jobs.push({ id: current.id, body: current.bodyLines.join("\n") });
  return jobs;
}

export function checkWorkflow(fileName, source) {
  const errors = [];

  if (!/^permissions:\s*\n(?:  .+\n|\{\})/m.test(source) && !/^permissions:\s*\{[^}]*\}/m.test(source)) {
    errors.push("missing top-level `permissions:` block");
  }
  if (!/^concurrency:\s*\n/m.test(source)) {
    errors.push("missing `concurrency:` block");
  }

  const jobs = parseJobs(source);
  if (jobs.length === 0) errors.push("no jobs parsed");
  for (const job of jobs) {
    if (!/timeout-minutes:\s*\d+/.test(job.body)) {
      errors.push(`job '${job.id}' missing timeout-minutes`);
    }
    const usesRefs = [...job.body.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]);
    for (const ref of usesRefs) {
      const [, version] = ref.split("@");
      if (!version || !/^[0-9a-f]{40}$/.test(version)) {
        errors.push(`job '${job.id}' uses '${ref}' — ref is not a full 40-char SHA`);
      }
    }
    if (job.body.includes("actions/checkout") && !PERSIST_CREDENTIALS_ALLOWLIST.has(fileName)) {
      // A checkout step is its own "- uses:" line plus any following `with:`
      // block, up to the next step or the end of the job. Persist-credentials
      // must live on the checkout step, so scope the check to that block.
      const stepStarts = [...job.body.matchAll(/^      - /gm)].map((m) => m.index);
      for (const start of stepStarts) {
        const next = stepStarts.find((i) => i > start) ?? job.body.length;
        const step = job.body.slice(start, next);
        if (step.includes("actions/checkout") && !/persist-credentials:\s*false/.test(step)) {
          errors.push(`job '${job.id}' checkout missing 'persist-credentials: false'`);
        }
      }
    }
  }
  return errors;
}

export function checkWorkflows(dir) {
  const errors = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    return { ok: false, errors: [`cannot read ${dir}`] };
  }
  for (const file of files.sort()) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const e of checkWorkflow(file, source)) errors.push(`${file}: ${e}`);
  }
  return { ok: errors.length === 0, errors };
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const dir = new URL("../.github/workflows", import.meta.url).pathname;
  const { ok, errors } = checkWorkflows(dir);
  if (!ok) {
    console.error("Workflow hardening violations:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("All workflows pass the hardening checks.");
}
