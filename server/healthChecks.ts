import { sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { parseSupabaseConfig } from "./_core/supabaseAdapter";
import {
  backupStatusSummary,
  getDriveConnection,
  lastBackupForKind,
  saveHealthSnapshot,
} from "./backupDb";
import { getDb } from "./db";
import { getAccessToken } from "./drive/driveOAuth";
import { findDriveFileByName } from "./drive/driveApi";
import { runIntegrityCheck } from "./integrityCheck";
import { APP_VERSION, SCHEMA_VERSION } from "./backupManifest";
import { getPerformanceSummary } from "./_core/requestMetrics";
import { getQueryTimingStats } from "./_core/queryTiming";

export type ProbeStatus = "ok" | "fail" | "unknown" | "not_configured";

export interface HealthCheckResult {
  id: string;
  label: string;
  status: ProbeStatus;
  timestamp: string;
  latencyMs?: number | null;
  error?: string | null;
  retryAction?: string;
  details?: string;
}

export interface HealthSummary {
  database: ProbeStatus;
  auth: ProbeStatus;
  storage: ProbeStatus;
  vercel: ProbeStatus;
  googleDrive: ProbeStatus;
  lastBackup: "ok" | "stale" | "none";
  lastSync: "ok" | "stale" | "none";
  integrity: ProbeStatus;
  overallStatus?: ProbeStatus;
}

export interface HealthReport {
  appVersion: string;
  schemaVersion: string;
  checkedAt: string;
  checks: HealthCheckResult[];
  summary: HealthSummary;
  integrity: Array<{
    projectId: number;
    projectName: string;
    status: string;
    diffs: number;
    checkedAt: string;
  }>;
}

function timed<T>(
  fn: () => Promise<T>
): Promise<{ latencyMs: number; result: T }> {
  const start = Date.now();
  return fn().then(result => ({ latencyMs: Date.now() - start, result }));
}

export async function runHealthChecks(
  userId: number | null
): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();
  const checks: HealthCheckResult[] = [];

  const dbProbe = await timed(async () => {
    const db = await getDb();
    if (!db) throw new Error("ডেটাবেস অপ্রাপ্য");
    await db.execute(sql`select 1`);
  });
  checks.push({
    id: "database.read",
    label: "ডেটাবেস সংযোগ",
    status: "ok",
    timestamp: checkedAt,
    latencyMs: dbProbe.latencyMs,
  });
  const dbWrite = await timed(async () => {
    await saveHealthSnapshot({
      probeId: "database.write",
      status: "ok",
      latencyMs: 0,
    });
  });
  checks.push({
    id: "database.write",
    label: "ডেটাবেস লেখা",
    status: "ok",
    timestamp: checkedAt,
    latencyMs: dbWrite.latencyMs,
  });

  const authMode = ENV.authMode;
  if (authMode === "google") {
    const configured = Boolean(
      ENV.googleOAuthClientId &&
      ENV.googleOAuthClientSecret &&
      ENV.googleOAuthRedirectUri
    );
    checks.push({
      id: "auth.google",
      label: "Google লগইন কনফিগারেশন",
      status: configured ? "ok" : "fail",
      timestamp: checkedAt,
      error: configured
        ? null
        : "GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI সেট নেই",
      retryAction: configured
        ? undefined
        : "প্রজেক্ট এনভায়রনমেন্টে OAuth ক্রেডেনশিয়াল সেট করুন",
    });
  } else {
    checks.push({
      id: "auth.password",
      label: "পাসওয়ার্ড লগইন",
      status: "ok",
      timestamp: checkedAt,
      details: "AUTH_MODE=password",
    });
  }

  const supabase = parseSupabaseConfig(process.env);
  if (!supabase) {
    checks.push({
      id: "storage.supabase",
      label: "Supabase স্টোরেজ (ব্যাকআপ টার্গেট)",
      status: "not_configured",
      timestamp: checkedAt,
      error: "SUPABASE_URL / SUPABASE_ANON_KEY সেট নেই; ঐচ্ছিক ওপশনাল টার্গেট",
    });
  } else {
    const probe = await timed(async () => {
      // Probe with the service-role key: anon cannot see private buckets
      // (it gets 404 even when the bucket exists) and would misreport the
      // backup destination as missing.
      const probeKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || supabase.supabaseAnonKey;
      const response = await fetch(
        `${supabase.supabaseUrl}/storage/v1/bucket/${supabase.storageBucket ?? "amar-hisab-backups"}`,
        {
          headers: {
            apikey: probeKey,
            Authorization: `Bearer ${probeKey}`,
          },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (response.status === 404)
        throw new Error(`বাকেটের অস্তিত্ব নেই: ${supabase.storageBucket}`);
      if (response.status === 401 || response.status === 403)
        throw new Error("Supabase API key অবৈধ");
      if (!response.ok)
        throw new Error(`Supabase উত্তর দেয়নি (${response.status})`);
    });
    checks.push({
      id: "storage.supabase",
      label: "Supabase স্টোরেজ (ব্যাকআপ টার্গেট)",
      status: "ok",
      timestamp: checkedAt,
      latencyMs: probe.latencyMs,
    });
  }

  checks.push({
    id: "storage.vercel_blob",
    label: "Vercel Blob স্টোরেজ",
    status: ENV.blobReadWriteToken ? "ok" : "not_configured",
    timestamp: checkedAt,
    error: ENV.blobReadWriteToken ? null : "BLOB_READ_WRITE_TOKEN সেট নেই",
    retryAction: ENV.blobReadWriteToken
      ? undefined
      : "Vercel Blob কানেক্ট করুন",
  });

  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;
  if (!vercelUrl) {
    checks.push({
      id: "vercel.api",
      label: "Vercel ডিপ্লয়মেন্ট / API",
      status: "unknown",
      timestamp: checkedAt,
      error: "VERCEL_URL বাইরে চলছে (local/ব্যাকগ্রাউন্ড)",
    });
  } else {
    const probe = await timed(async () => {
      const response = await fetch(`${vercelUrl}/api/healthz`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`healthz উত্তর দেয়নি (${response.status})`);
    });
    checks.push({
      id: "vercel.api",
      label: "Vercel ডিপ্লয়মেন্ট / API",
      status: "ok",
      timestamp: checkedAt,
      latencyMs: probe.latencyMs,
    });
  }

  await saveHealthSnapshot({ probeId: "db.write", status: "ok" });

  if (!userId) {
    checks.push({
      id: "drive.connection",
      label: "Google Drive সংযোগ",
      status: "not_configured",
      timestamp: checkedAt,
      error: "অ্যাডমিন কনটেক্সট প্রয়োজন",
    });
  } else {
    const connection = await getDriveConnection(userId);
    const driveActive = connection && !connection.revokedAt;
    const driveProbe = driveActive
      ? await timed(async () => {
          const token = await getAccessToken(connection);
          const root = await findDriveFileByName(
            token,
            connection.rootFolderName || "Money_Tracker",
            null,
            "application/vnd.google-apps.folder"
          );
          if (!root) throw new Error("রুট ফোল্ডার পাওয়া যায়নি");
        })
      : null;
    checks.push({
      id: "drive.connection",
      label: "Google Drive সংযোগ",
      status: driveProbe ? "ok" : "not_configured",
      timestamp: checkedAt,
      latencyMs: driveProbe?.latencyMs ?? null,
      error: driveProbe
        ? null
        : "Google Drive সংযুক্ত নয়; System Health পেজে কানেক্ট করুন",
      retryAction: driveProbe ? undefined : "Drive সংযোগ করুন",
    });
  }

  const lastDatabaseBackup = userId
    ? await lastBackupForKind(userId, "database")
    : null;
  const lastNonDatabase = userId
    ? (
        await Promise.all(
          (
            [
              "vouchers",
              "daily_statement",
              "monthly_statement",
              "documents",
            ] as const
          ).map(kind => lastBackupForKind(userId, kind))
        )
      ).sort(
        (
          a: { verifiedAt: Date | null } | null,
          b: { verifiedAt: Date | null } | null
        ) => (b?.verifiedAt?.getTime() ?? 0) - (a?.verifiedAt?.getTime() ?? 0)
      )[0]
    : null;

  const backupAgeHours = (verifiedAt: Date | null) =>
    verifiedAt ? (Date.now() - verifiedAt.getTime()) / 3_600_000 : Infinity;

  const lastBackupStatus: HealthSummary["lastBackup"] = !lastDatabaseBackup
    ? "none"
    : backupAgeHours(lastDatabaseBackup.verifiedAt) <= 48
      ? "ok"
      : "stale";
  const lastSyncStatus: HealthSummary["lastSync"] = !lastNonDatabase
    ? "none"
    : backupAgeHours(lastNonDatabase.verifiedAt) <= 24 * 7
      ? "ok"
      : "stale";

  checks.push({
    id: "backup.last",
    label: "সর্বশেষ ডেটাবেস ব্যাকআপ",
    status:
      lastBackupStatus === "none"
        ? "fail"
        : lastBackupStatus === "stale"
          ? "fail"
          : "ok",
    timestamp: checkedAt,
    error: !lastDatabaseBackup
      ? "এখনো কোনো ডেটাবেস ব্যাকআপ হয়নি"
      : backupAgeHours(lastDatabaseBackup.verifiedAt) > 48
        ? `শেষ যাচাই ${Math.round(backupAgeHours(lastDatabaseBackup.verifiedAt))} ঘণ্টা আগে`
        : null,
    retryAction: !lastDatabaseBackup ? "এখনই ব্যাকআপ চালান" : undefined,
  });

  if (userId) {
    const summary = await backupStatusSummary(userId);
    checks.push({
      id: "backup.pending",
      label: "মুলতুবি/ব্যর্থ ব্যাকআপ",
      status: summary.pending === 0 && summary.failed === 0 ? "ok" : "fail",
      timestamp: checkedAt,
      error:
        summary.failed > 0
          ? `${summary.failed} ব্যর্থ`
          : summary.pending > 0
            ? `${summary.pending} মুলতুবি`
            : null,
      retryAction:
        summary.pending > 0 || summary.failed > 0
          ? `pending=${summary.pending}, failed=${summary.failed} — রিট্রাই করুন`
          : undefined,
    });
  }

  let integrity: HealthReport["integrity"] = [];
  if (userId) {
    const projects = await import("./db").then(m => m.listProjects(userId));
    const checkedProjects = projects.slice(0, 10);
    const results = await Promise.all(
      checkedProjects.map(project => runIntegrityCheck(userId, project.id))
    );
    integrity = results.map(r => ({
      projectId: r.projectId,
      projectName: r.projectName,
      status: r.status,
      diffs: r.diffs.length,
      checkedAt: r.checkedAt,
    }));
    checks.push({
      id: "integrity",
      label: "ডেটা ইন্টিগ্রিটি (প্রজেক্টের সাথে মিল)",
      status: results.every(r => r.status === "VERIFIED")
        ? "ok"
        : results.some(r => r.status === "MISMATCH")
          ? "fail"
          : "fail",
      timestamp: checkedAt,
      error: results.some(r => r.status === "MISMATCH")
        ? `${results.filter(r => r.status === "MISMATCH").length} প্রজেক্টে অমিল`
        : results.some(r => r.status === "NO_BACKUP")
          ? "কিছু প্রজেক্টের জন্য এখনো কোনো ডেটাবেস ব্যাকআপ নেই"
          : null,
    });
  }

  // Informational probes: they never feed summary/overallStatus, they just
  // put the collected latency numbers in front of whoever reads the report.
  const perf = getPerformanceSummary();
  checks.push({
    id: "performance.requests",
    label: "রিকোয়েস্ট লেটেন্সি",
    status: "ok",
    timestamp: checkedAt,
    latencyMs: perf.totalRequests > 0 ? perf.p95 : null,
    details:
      perf.totalRequests > 0
        ? `p50 ${perf.p50}ms · p95 ${perf.p95}ms · p99 ${perf.p99}ms · সর্বোচ্চ ${perf.max}ms · ${perf.totalRequests}টি অনুরোধ · ${perf.slowRequests}টি ${perf.slowRequestThresholdMs}ms+ · ${perf.routeCount}টি রুট`
        : "এই প্রসেসে এখনো কোনো অনুরোধ মাপা হয়নি",
  });

  const queryTiming = getQueryTimingStats();
  checks.push({
    id: "performance.slowQueries",
    label: "ধীর ডেটাবেস কোয়েরি",
    status: "ok",
    timestamp: checkedAt,
    details:
      queryTiming.totalQueries > 0
        ? `${queryTiming.totalQueries}টি কোয়েরি · ${queryTiming.slowQueries}টি ${queryTiming.slowQueryThresholdMs}ms+${queryTiming.recentSlowQueries.length ? ` · সাম্প্রতিক: ${queryTiming.recentSlowQueries[0].durationMs}ms` : ""}`
        : "এই প্রসেসে এখনো কোনো কোয়েরি মাপা হয়নি",
  });

  const toRate = (id: string) =>
    checks.find(check => check.id === id)?.status ?? "unknown";
  const summary: HealthSummary = {
    database:
      toRate("database.read") === "ok" && toRate("database.write") === "ok"
        ? "ok"
        : "fail",
    auth:
      toRate("auth.google") !== "unknown"
        ? toRate("auth.google")
        : toRate("auth.password"),
    storage:
      toRate("storage.supabase") === "ok" ||
      toRate("storage.vercel_blob") === "ok"
        ? "ok"
        : "not_configured",
    vercel: toRate("vercel.api"),
    googleDrive: toRate("drive.connection"),
    lastBackup: lastBackupStatus,
    lastSync: lastSyncStatus,
    integrity: toRate("integrity"),
  };

  const overallStatus =
    summary.database === "ok" && summary.storage !== "fail" && summary.auth !== "fail"
      ? "ok"
      : "degraded";
  return {
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    checkedAt,
    checks,
    summary,
    integrity,
    overallStatus,
  } as HealthReport;
}
