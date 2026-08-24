/**
 * Vercel functions live under `/api`, while the existing storage proxy is a
 * same-origin non-API path. Keep that public path stable after Vercel rewrites
 * it to the catch-all function.
 */
export function normalizeVercelRequestPath(url: string): string {
  return url.replace(/^\/api\/manus-storage(?=\/|\?|$)/, "/manus-storage");
}
