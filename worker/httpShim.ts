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
  /** Marks this object as an HTTP shim (vs. a real Express Response). */
  readonly __shim: true;
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
  redirect(status: number, url: string): ShimResponse;
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
  headers.forEach((value, key) => {
    reqHeaders[key.toLowerCase()] = value;
  });

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

export function isShimResponse(res: unknown): res is ShimResponse {
  return (
    typeof res === "object" && res !== null && (res as ShimResponse).__shim === true
  );
}

export function createShimResponse(targetHeaders?: Headers): ShimResponse {
  const headers = targetHeaders ?? new Headers();
  const foreignCookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  let statusCode = 200;
  let body: unknown = null;
  const cookies = new Map<string, string>();

  const syncSetCookie = () => {
    headers.delete("Set-Cookie");
    for (const str of foreignCookies) {
      headers.append("Set-Cookie", str);
    }
    for (const str of cookies.values()) {
      headers.append("Set-Cookie", str);
    }
  };

  return {
    __shim: true,
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    headers,
    get body() {
      return body;
    },
    set body(value: unknown) {
      body = value;
    },
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      let str = `${name}=${encodeURIComponent(value)}`;
      if (options) {
        const maxAge = Number(options.maxAge);
        if (Number.isFinite(maxAge)) {
          str += `; Max-Age=${Math.floor(maxAge / 1000)}`;
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
      cookies.set(name, str);
      syncSetCookie();
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      let str = `${name}=; Max-Age=0`;
      if (options) {
        if (options.path) str += `; Path=${options.path}`;
        if (options.domain) str += `; Domain=${options.domain}`;
        if (options.httpOnly) str += "; HttpOnly";
        if (options.secure) str += "; Secure";
      }
      cookies.set(name, str);
      syncSetCookie();
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
    redirect(urlOrStatus: string | number, url?: string) {
      if (typeof urlOrStatus === "number") {
        statusCode = urlOrStatus;
        headers.set("Location", url ?? "");
      } else {
        statusCode = 302;
        headers.set("Location", urlOrStatus);
      }
      return this;
    },
  };
}

function isStreamBody(value: unknown): value is ReadableStream {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReadableStream).getReader === "function"
  );
}

export function shimToResponse(shim: ShimResponse): Response {
  const headers = new Headers(shim.headers);
  const hasBody =
    shim.body !== null &&
    shim.body !== undefined &&
    shim.statusCode !== 204 &&
    shim.statusCode !== 304;
  const body = !hasBody
    ? null
    : typeof shim.body === "string"
      ? shim.body
      : isStreamBody(shim.body)
        ? shim.body
        : JSON.stringify(shim.body);
  return new Response(body, {
    status: shim.statusCode,
    headers,
  });
}
