import { ENV } from "./_core/env";
import { keyIdForSecret } from "./backupIntegrity";

/**
 * The backup keyring.
 *
 * `BACKUP_ENCRYPTION_KEYS` is a comma-separated list: the first key encrypts
 * new backups, every key in the list may decrypt. Rotating therefore means
 * prepending the new key and keeping the old one until every backup made with
 * it has aged past `BACKUP_RETENTION_DAYS` — nothing already stored becomes
 * unreadable. `BACKUP_ENCRYPTION_KEY` (single key) keeps working and counts as
 * the active key.
 */
export interface BackupKey {
  id: string;
  secret: string;
  active: boolean;
}

/** Read env at call time so tests can stub it after import. */
export function getBackupKeySecrets(): string[] {
  const list = process.env.BACKUP_ENCRYPTION_KEYS;
  if (list && list.trim()) {
    const secrets = list
      .split(",")
      .map(secret => secret.trim())
      .filter(Boolean);
    if (secrets.length > 0) return secrets;
  }
  const single = process.env.BACKUP_ENCRYPTION_KEY || ENV.backupEncryptionKey;
  return single ? [single] : [];
}

export function activeBackupKeySecret(): string | undefined {
  return getBackupKeySecrets()[0];
}

export async function describeBackupKeys(): Promise<BackupKey[]> {
  const secrets = getBackupKeySecrets();
  return Promise.all(
    secrets.map(async (secret, index) => ({
      id: await keyIdForSecret(secret),
      secret,
      active: index === 0,
    }))
  );
}
