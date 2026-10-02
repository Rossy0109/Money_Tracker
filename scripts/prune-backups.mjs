/**
 * Prune old encrypted backups from the Supabase backup bucket.
 *
 * Runs after a verified daily backup. Deletion is opt-in via --apply so the
 * default invocation is a safe report, and the selection rules in
 * ./lib/backup-retention.mjs keep a per-project floor regardless.
 *
 * Usage:
 *   node scripts/prune-backups.mjs                       # dry run, report only
 *   node scripts/prune-backups.mjs --apply               # delete
 *   node scripts/prune-backups.mjs --apply --retention-days 30
 *
 * Requires SUPABASE_URL and SUPABASE_KEY (the service-role/admin key).
 */
import {
  selectPrunableObjects,
  summarizePlan,
} from "./lib/backup-retention.mjs";

const BUCKET = "amar-hisab-backups";
const LIST_PAGE_SIZE = 1000;

function parseArgs(argv) {
  const options = {
    apply: false,
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 90),
    keepPerProject: Number(process.env.BACKUP_KEEP_PER_PROJECT ?? 7),
    now: new Date(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--retention-days") {
      options.retentionDays = Number(argv[++i]);
    } else if (arg === "--keep-per-project") {
      options.keepPerProject = Number(argv[++i]);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[prune-backups] ${name} is required.`);
    process.exit(1);
  }
  return value;
}

async function supabaseFetch(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${init?.method ?? "GET"} ${url}: ${text.slice(0, 300)}`
    );
  }
  return text ? JSON.parse(text) : null;
}

/** Supabase lists at most LIST_PAGE_SIZE per call, so page until exhausted. */
async function listAllObjects(base, key) {
  const objects = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const page = await supabaseFetch(
      `${base}/storage/v1/object/list/${BUCKET}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prefix: "",
          limit: LIST_PAGE_SIZE,
          offset,
        }),
      }
    );

    const batch = Array.isArray(page) ? page : [];
    objects.push(...batch);
    if (batch.length < LIST_PAGE_SIZE) break;
  }
  return objects;
}

async function deleteObjects(base, key, names) {
  const deleted = [];
  // Small batches keep a single API failure from leaving an unclear state.
  for (let i = 0; i < names.length; i += 25) {
    const batch = names.slice(i, i + 25);
    await supabaseFetch(`${base}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: batch }),
    });
    deleted.push(...batch);
  }
  return deleted;
}

const options = parseArgs(process.argv.slice(2));

if (!Number.isFinite(options.retentionDays) || options.retentionDays < 1) {
  console.error("--retention-days must be a positive number");
  process.exit(2);
}

const supabaseUrl = required("SUPABASE_URL").replace(/\/+$/, "");
const supabaseKey = required("SUPABASE_KEY");

const objects = await listAllObjects(supabaseUrl, supabaseKey);
const plan = selectPrunableObjects(objects, options);
const summary = summarizePlan(plan);

console.log(
  `[prune-backups] bucket=${BUCKET} objects=${objects.length} ` +
    `retentionDays=${options.retentionDays} keepPerProject=${options.keepPerProject}`
);
console.log(
  `[prune-backups] mode=${options.apply ? "APPLY" : "DRY RUN"} ` +
    `delete=${summary.deleteCount} keep=${summary.keepCount} ` +
    `unrecognized=${summary.unrecognizedCount} ` +
    `reclaim=${summary.deleteBytes}B`
);

if (plan.unrecognized.length > 0) {
  console.log(
    `[prune-backups] left untouched (not a backup filename): ${plan.unrecognized.join(", ")}`
  );
}

if (plan.delete.length === 0) {
  console.log("[prune-backups] Nothing to delete.");
  process.exit(0);
}

for (const entry of plan.delete) {
  console.log(`[prune-backups] would delete ${entry.name} (${entry.timestamp})`);
}

if (!options.apply) {
  console.log("[prune-backups] Dry run only. Re-run with --apply to delete.");
  process.exit(0);
}

const deleted = await deleteObjects(
  supabaseUrl,
  supabaseKey,
  plan.delete.map(entry => entry.name)
);

console.log(`[prune-backups] Deleted ${deleted.length} object(s).`);

// Re-list so the log records the state the bucket was actually left in.
const remaining = await listAllObjects(supabaseUrl, supabaseKey);
console.log(`[prune-backups] Objects remaining: ${remaining.length}`);