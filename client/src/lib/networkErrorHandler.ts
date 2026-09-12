export type NetworkErrorKind =
  | "TIMEOUT"
  | "SERVER_5XX"
  | "RATE_LIMIT_429"
  | "MALFORMED_RESPONSE"
  | "CORS_OR_SECURITY"
  | "OFFLINE"
  | "CLIENT_4XX"
  | "UNKNOWN";

export interface ClassifiedNetworkError {
  kind: NetworkErrorKind;
  statusCode?: number;
  message: string;
  userFacingMessage: string;
  shouldRetry: boolean;
  retryDelayMs: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function isBrowserOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

export function classifyNetworkError(
  error: unknown,
  isOnline?: boolean
): ClassifiedNetworkError {
  const online = typeof isOnline === "boolean" ? isOnline : isBrowserOnline();

  if (!online) {
    return {
      kind: "OFFLINE",
      message: "Network connection lost",
      userFacingMessage: "ইন্টারনেট সংযোগ বিচ্ছিন্ন। সংযোগ ফিরে আসলে পুনরায় চেষ্টা করা হবে।",
      shouldRetry: true,
      retryDelayMs: 3000,
    };
  }

  const errStr = String(error ?? "");
  const errMsg = (error instanceof Error ? error.message : errStr).toLowerCase();

  // 1. Timeout
  if (
    errMsg.includes("timeout") ||
    errMsg.includes("abort") ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    return {
      kind: "TIMEOUT",
      message: "Request timed out after 30 seconds",
      userFacingMessage: "অনুরোধের সময় শেষ হয়ে গেছে (Timeout)। সার্ভার থেকে উত্তর পাওয়া যায়নি।",
      shouldRetry: true,
      retryDelayMs: 2000,
    };
  }

  // 4. Malformed API Response (check before status codes as JSON parse errors may not have status)
  if (
    error instanceof SyntaxError ||
    errMsg.includes("unexpected token") ||
    errMsg.includes("invalid json") ||
    errMsg.includes("is not valid json")
  ) {
    return {
      kind: "MALFORMED_RESPONSE",
      message: "Malformed or non-JSON response from server",
      userFacingMessage: "সার্ভার থেকে অপ্রত্যাশিত উত্তর এসেছে। অনুগ্রহ করে পৃষ্ঠাটি রিফ্রেশ করুন।",
      shouldRetry: false,
      retryDelayMs: 0,
    };
  }

  // Check for HTTP status in tRPC or fetch error shape
  const status =
    (error as any)?.data?.httpStatus ??
    (error as any)?.status ??
    (error as any)?.response?.status;

  // 2. Server 5xx Errors
  if (status && status >= 500 && status < 600) {
    return {
      kind: "SERVER_5XX",
      statusCode: status,
      message: `Server returned error ${status}`,
      userFacingMessage: `সার্ভারে সমস্যা দেখা দিয়েছে (${status})। স্বয়ংক্রিয়ভাবে পুনরায় চেষ্টা করা হচ্ছে...`,
      shouldRetry: true,
      retryDelayMs: 2000,
    };
  }

  // 3. Rate Limit 429
  if (
    status === 429 ||
    errMsg.includes("too many requests") ||
    errMsg.includes("rate limit") ||
    errMsg.includes("বেশি চেষ্টা") ||
    errMsg.includes("সীমাবদ্ধতা")
  ) {
    return {
      kind: "RATE_LIMIT_429",
      statusCode: 429,
      message: "Too many requests",
      userFacingMessage: "খুব বেশি অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।",
      shouldRetry: true,
      retryDelayMs: 5000,
    };
  }

  // 5. CORS or Security Errors (Failed to fetch when online without HTTP response status)
  if (
    (errMsg.includes("failed to fetch") || errMsg.includes("networkerror") || errMsg.includes("cross-origin")) &&
    !status
  ) {
    return {
      kind: "CORS_OR_SECURITY",
      message: "Cross-origin or security connection blocked",
      userFacingMessage: "সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না (CORS বা সিকিউরিটি সীমাবদ্ধতা)।",
      shouldRetry: false,
      retryDelayMs: 0,
    };
  }

  // Other 4xx client errors (e.g. 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found)
  if (status && status >= 400 && status < 500) {
    return {
      kind: "CLIENT_4XX",
      statusCode: status,
      message: `Client error ${status}`,
      userFacingMessage: (error as any)?.message || "অনুরোধটি সঠিক নয়।",
      shouldRetry: false,
      retryDelayMs: 0,
    };
  }

  return {
    kind: "UNKNOWN",
    message: (error instanceof Error ? error.message : errStr) || "Unknown error",
    userFacingMessage: "একটি অপ্রত্যাশিত ত্রুটি ঘটেছে। পুনরায় চেষ্টা করুন।",
    shouldRetry: false,
    retryDelayMs: 0,
  };
}

export function shouldRetryQuery(failureCount: number, error: unknown, isOnline?: boolean): boolean {
  if (failureCount >= 3) return false;
  const classified = classifyNetworkError(error, isOnline);
  return classified.shouldRetry;
}

export function getRetryDelay(attemptIndex: number, error: unknown, isOnline?: boolean): number {
  const classified = classifyNetworkError(error, isOnline);
  if (classified.kind === "RATE_LIMIT_429") {
    return Math.max(5000, (attemptIndex + 1) * 3000);
  }
  return Math.min(1000 * 2 ** attemptIndex, 10000);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const originalSignal = init?.signal;

  if (originalSignal) {
    originalSignal.addEventListener("abort", () => controller.abort());
  }

  const timeoutTimer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "AbortError"));
  }, timeoutMs);

  try {
    const response = await globalThis.fetch(input, {
      ...(init ?? {}),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

// Throttle toast notifications so burst queries don't flood the UI
let lastToastTime = 0;
let lastToastMessage = "";

export function resetNotificationThrottleForTest() {
  lastToastTime = 0;
  lastToastMessage = "";
}

export function notifyNetworkError(
  error: unknown,
  toastFn?: (msg: string, type: "error" | "warning" | "info") => void,
  isOnline?: boolean
) {
  const classified = classifyNetworkError(error, isOnline);
  const now = Date.now();

  // Deduplicate identical alerts within 3 seconds
  if (now - lastToastTime < 3000 && lastToastMessage === classified.userFacingMessage) {
    return;
  }

  lastToastTime = now;
  lastToastMessage = classified.userFacingMessage;

  if (!toastFn) return;

  switch (classified.kind) {
    case "OFFLINE":
    case "RATE_LIMIT_429":
      toastFn(classified.userFacingMessage, "warning");
      break;
    case "SERVER_5XX":
    case "TIMEOUT":
    case "CORS_OR_SECURITY":
    case "MALFORMED_RESPONSE":
      toastFn(classified.userFacingMessage, "error");
      break;
    default:
      break;
  }
}
