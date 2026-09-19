export function dirnameFromMetaUrl(metaUrl: string): string {
  const url = new URL(metaUrl);
  return url.pathname.replace(/\/[^/]*$/, "");
}

export function resolveProjectRoot(metaUrl: string): string {
  const url = new URL(metaUrl);
  return url.pathname.replace(/\/[^/]*$/, "");
}