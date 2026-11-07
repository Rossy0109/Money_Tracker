import { COOKIE_NAME } from "@shared/const";

/**
 * P3-S-5 — Preview-only session mirror.
 *
 * When a browser blocks iframe cookies (Safari ITP, private browsing,
 * WebView), the preview runtime mirrors the session cookie into
 * sessionStorage under {@link SESSION_MIRROR_KEY} so requests can forward it
 * as a Bearer token (see the httpBatchLink headers in `main.tsx`).
 *
 * The mirror sidesteps the cookie's httpOnly protection, so it is honored
 * ONLY on loopback and preview hosts. Production hosts ignore it entirely
 * and fall back to the cookie alone — if a production XSS could not read the
 * httpOnly cookie, it must not be able to read a mirrored copy either.
 */

export const SESSION_MIRROR_KEY = "auth-session-cookie";

/** Hosts where the sessionStorage session mirror may be read. */
export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // Local development (wrangler dev / vite dev / e2e runners).
  if (host === "localhost" || host === "127.0.0.1" || host === "::1")
    return true;
  if (host === "[::1]") return true;
  // Netlify deploy previews: deploy-preview-284--moneytrackerwebapp.netlify.app
  if (host.includes("deploy-preview-")) return true;
  // Vercel branch previews: <project>-git-<branch>-<team>.vercel.app
  if (/-git-[^.]+\.vercel\.app$/.test(host)) return true;
  return false;
}

/**
 * Read the mirrored session token, or null when the host is not a preview
 * host, the mirror is absent, or storage is unavailable.
 */
export function readMirroredSessionCookie(): string | null {
  if (typeof window === "undefined") return null;
  if (!isPreviewHost(window.location.hostname)) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_MIRROR_KEY);
    if (!raw) return null;
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw.split(";").find(part => part.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    return token ? token : null;
  } catch {
    // sessionStorage may be unavailable in private/WebView contexts.
    return null;
  }
}
