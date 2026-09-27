/**
 * HTTP shim: bridges Fetch API Request/Response to Express-style req/res.
 *
 * The existing business logic (oauth.ts, cookies.ts, adminSession.ts, sdk.ts)
 * uses Express Request/Response objects. This shim provides a compatible
 * interface on top of the Fetch API, allowing all existing code to work
 * unchanged in the Worker runtime.
 */

export interface ShimRequest {
  method: string;
  url: string;
  path: string;
  originalUrl: string;
  headers: {
    get(name: string): string | null;
    [key: string]: unknown;
  };
  ip: string;
  protocol: string;
  hostname: string;
  get(name: string): string | null;
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  socket?: { remoteAddress?: string };
}

export interface ShimResponse {
  statusCode: number;
  headers: Headers;
  body: unknown;
  cookie(name: string, value: string, options?: Record<string, unknown>): void;
  clearCookie(name: string, options?: Record<string, unknown>): void;
  set(name: string, value: string): void;
  setHeader(name: string, value: string): void;
  get(name: string): string | null;
  status(code: number): ShimResponse;
  json(data: unknown): ShimResponse;
  send(data: unknown): ShimResponse;
  end(): ShimResponse;
  redirect(url: string): ShimResponse;
}

function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) {
      map.set(name.trim(), rest.join("="));
    }
  }
  return map;
}

export function createShimRequest(
  request: Request,
  body?: unknown,
  params?: Record<string, string>
): ShimRequest {
  const url = new URL(request.url);
  const headers = request.headers;

  const reqHeaders: Record<string, unknown> = {
    get(name: string) {
      return headers.get(name.toLowerCase());
    },
  };

  const ip =
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown-ip";

  return {
    method: request.method,
    url: url.pathname + url.search,
    path: url.pathname,
    originalUrl: url.pathname + url.search,
    headers: reqHeaders as ShimRequest["headers"],
    ip,
    protocol: url.protocol.replace(":", ""),
    hostname: url.hostname,
    get(name: string) {
      return headers.get(name.toLowerCase());
    },
    body,
    query: Object.fromEntries(url.searchParams),
    params: params ?? {},
  };
}

export function createShimResponse(): ShimResponse {
  const headers = new Headers();
  let statusCode = 200;
  let body: unknown = null;
  const cookies: string[] = [];

  const serializeCookies = () => {
    for (const c of cookies) {
      headers.append("Set-Cookie", c);
    }
  };

  return {
    statusCode,
    headers,
    body,
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      let str = `${name}=${encodeURIComponent(value)}`;
      if (options) {
        if (options.maxAge !== undefined) {
          str += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
        }
        if (options.path) str += `; Path=${options.path}`;
        if (options.domain) str += `; Domain=${options.domain}`;
        if (options.httpOnly) str += "; HttpOnly";
        if (options.secure) str += "; Secure";
        if (options.sameSite) {
          const ss =
            options.sameSite === "lax"
              ? "Lax"
              : options.sameSite === "strict"
                ? "Strict"
                : "None";
          str += `; SameSite=${ss}`;
        }
      }
      cookies.push(str);
      serializeCookies();
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      let str = `${name}=; Max-Age=0`;
      if (options) {
        if (options.path) str += `; Path=${options.path}`;
        if (options.domain) str += `; Domain=${options.domain}`;
        if (options.httpOnly) str += "; HttpOnly";
        if (options.secure) str += "; Secure";
      }
      cookies.push(str);
      serializeCookies();
    },
    set(name: string, value: string) {
      headers.set(name, value);
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    get(name: string) {
      return headers.get(name);
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(data);
      return this;
    },
    send(data: unknown) {
      if (typeof data === "string") {
        body = data;
      } else if (data !== undefined && data !== null) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(data);
      }
      return this;
    },
    end() {
      return this;
    },
    redirect(url: string) {
      statusCode = 302;
      headers.set("Location", url);
      return this;
    },
  };
}

export function shimToResponse(shim: ShimResponse): Response {
  const headers = new Headers(shim.headers);
  const body =
    typeof shim.body === "string" ? shim.body : JSON.stringify(shim.body);
  return new Response(body, {
    status: shim.statusCode,
    headers,
  });
}
