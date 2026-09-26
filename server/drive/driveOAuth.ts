export async function getAccessToken(_connection: {
  accessToken?: string;
  refreshToken?: string;
  revokedAt?: Date | null;
  rootFolderName?: string | null;
}): Promise<string> {
  return "";
}
