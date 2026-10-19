/**
 * The persisted Google Drive connection for a user, as read from
 * `drive_connections`. Tokens are still encrypted here — callers must go
 * through `getAccessToken` to obtain a usable bearer token.
 */
export interface DriveConnectionRecord {
  userId: number;
  revokedAt: Date | null;
  rootFolderName: string | null;
  rootFolderId: string | null;
  scope: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: Date | null;
  lastVerifiedAt: Date | null;
}
