/**
 * Vercel path normalization - no longer needed for manus-storage.
 * Kept for compatibility with existing vercel-handler.ts import.
 */
export function normalizeVercelRequestPath(url: string): string {
  return url;
}