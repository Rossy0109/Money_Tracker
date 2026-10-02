/**
 * Backup retention selection — pure, no network, no filesystem.
 *
 * Lives apart from the CLI wrapper so the deletion decision can be unit tested
 * without touching the bucket. Every rule here is written to make an accidental
 * mass delete impossible:
 *
 *   1. only names matching the exact backup filename pattern are ever eligible,
 *      so unrelated files (__probe2.json, README-ish objects) are never touched;
 *   2. every project keeps at least `keepPerProject` most recent backups no
 *      matter how old they are, so a wrong clock or a parse bug cannot empty
 *      the bucket;
 *   3. an unparseable date is never deleted.
 */

/** `<project>-backup-YYYY-MM-DD-<checksum>.enc.json` */
const BACKUP_NAME_PATTERN =
  /^(?<project>.+)-backup-(?<date>\d{4}-\d{2}-\d{2})-(?<checksum>[0-9a-fA-F]{8,64})\.enc\.json$/;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Split a backup object name into its parts.
 * Returns null for anything that is not a recognisable backup file.
 */
export function parseBackupObjectName(name) {
  if (typeof name !== "string") return null;
  const match = BACKUP_NAME_PATTERN.exec(name);
  if (!match?.groups) return null;

  const dateText = match.groups.date;
  const timestamp = Date.parse(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return null;

  return {
    project: match.groups.project,
    date: dateText,
    timestamp,
    checksum: match.groups.checksum,
  };
}

/** Newest first, with the name as a stable tie-breaker for same-day backups. */
function byNewestFirst(a, b) {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
  return b.name < a.name ? -1 : b.name > a.name ? 1 : 0;
}

/**
 * Decide which objects to delete.
 *
 * @param {{name: string, size?: number}[]} objects
 * @param {{retentionDays: number, keepPerProject?: number, now?: Date|number}} options
 * @returns {{delete: object[], keep: object[], unrecognized: string[]}}
 */
export function selectPrunableObjects(objects, options) {
  const {
    retentionDays,
    keepPerProject = 7,
    now = new Date(),
  } = options;

  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new RangeError("retentionDays must be a positive number");
  }
  if (!Number.isInteger(keepPerProject) || keepPerProject < 1) {
    throw new RangeError("keepPerProject must be a positive integer");
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("now must be a Date or timestamp");
  }

  const cutoff = nowMs - retentionDays * DAY_MS;

  const recognized = [];
  const unrecognized = [];

  for (const object of objects ?? []) {
    const parsed = parseBackupObjectName(object?.name);
    if (!parsed) {
      if (object?.name) unrecognized.push(object.name);
      continue;
    }
    recognized.push({ ...object, ...parsed });
  }

  const perProject = new Map();
  for (const entry of recognized) {
    const list = perProject.get(entry.project) ?? [];
    list.push(entry);
    perProject.set(entry.project, list);
  }

  const keep = [];
  const toDelete = [];

  for (const [, list] of perProject) {
    list.sort(byNewestFirst);

    list.forEach((entry, index) => {
      // Floor first: the newest N are untouchable regardless of age.
      if (index < keepPerProject) {
        keep.push(entry);
        return;
      }
      if (entry.timestamp <= cutoff) {
        toDelete.push(entry);
      } else {
        keep.push(entry);
      }
    });
  }

  toDelete.sort(byNewestFirst);
  keep.sort(byNewestFirst);

  return { delete: toDelete, keep, unrecognized };
}

/** Human-readable one-liner for workflow logs. */
export function summarizePlan(plan) {
  const bytes = plan.delete.reduce((total, entry) => total + (entry.size ?? 0), 0);
  const keptBytes = plan.keep.reduce(
    (total, entry) => total + (entry.size ?? 0),
    0
  );
  return {
    deleteCount: plan.delete.length,
    keepCount: plan.keep.length,
    unrecognizedCount: plan.unrecognized.length,
    deleteBytes: bytes,
    keepBytes: keptBytes,
  };
}