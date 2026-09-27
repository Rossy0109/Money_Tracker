import type { Context, Next } from "hono";
import type { WorkerEnv } from "./env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") return true;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    const protos = forwardedProto.split(",");
    if (protos.some(p => p.trim().toLowerCase() === "https")) return true;
  }
  const hostname = url.hostname.toLowerCase();
  return LOCAL_HOSTS.has(hostname) || LOCAL_HOSTS.has(hostname.replace(/^\[|\]$/g, ""));
}

export function getSessionCookieOptions(req: Request): {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}

export function getOAuthTransactionCookieOptions(req: Request): {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}

export function getAdminSessionCookieOptions(req: Request): {
  httpOnly: boolean;
  path: string;
  sameSite: "strict";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: isSecureRequest(req),
  };
}

export function securityHeaders(env: WorkerEnv) {
  return async (c: Context, next: Next) => {
    await next();

    const isProd = env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self'${isProd ? "" : " 'unsafe-inline'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    c.res.headers.set("Content-Security-Policy", csp);
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("X-Download-Options", "noopen");
    c.res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

    if (isProd) {
      c.res.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }
  };
}

export function corsMiddleware(env: WorkerEnv) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin");
    const isProd = env.NODE_ENV === "production";

    if (isProd) {
      const isAllowedOrigin =
        !origin ||
        origin === env.APP_URL ||
        origin.endsWith(".workers.dev");

      if (isAllowedOrigin) {
        c.res.headers.set("Access-Control-Allow-Origin", origin || env.APP_URL);
      }
    } else {
      c.res.headers.set("Access-Control-Allow-Origin", origin || "*");
    }

    c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret, X-Admin-Password");
    c.res.headers.set("Access-Control-Expose-Headers", "X-Request-Id");
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Access-Control-Max-Age", "86400");

    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: c.res.headers });
    }

    await next();
  };
}
