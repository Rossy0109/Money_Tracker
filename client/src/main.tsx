import * as Sentry from "@sentry/react";
import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

import { toast } from "sonner";
import { readMirroredSessionCookie } from "./lib/previewSession";
import {
  fetchWithTimeout,
  getRetryDelay,
  notifyNetworkError,
  shouldRetryQuery,
} from "./lib/networkErrorHandler";

// Initialize Sentry for client-side error tracking
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

const shouldRegisterServiceWorker =
  import.meta.env.PROD || import.meta.env.VITE_PWA_E2E === "true";

if (shouldRegisterServiceWorker && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      console.warn("[PWA] Offline shell registration failed", error);
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => shouldRetryQuery(failureCount, error),
      retryDelay: (attemptIndex, error) => getRetryDelay(attemptIndex, error),
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: (failureCount, error) => shouldRetryQuery(failureCount, error),
      retryDelay: (attemptIndex, error) => getRetryDelay(attemptIndex, error),
      networkMode: "offlineFirst",
    },
  },
});

const dispatchToast = (msg: string, type: "error" | "warning" | "info") => {
  if (type === "error") toast.error(msg);
  else if (type === "warning") toast.warning(msg);
  else toast.info(msg);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
    notifyNetworkError(error, dispatchToast, undefined, {
      toastClientErrors: true,
    });
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
    notifyNetworkError(error, dispatchToast);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback (P3-S-5): when the browser blocks iframe
        // cookies (Safari ITP / private browsing / WebView), the runtime may
        // mirror the session into sessionStorage so we can forward it as a
        // Bearer token. readMirroredSessionCookie only honors that mirror on
        // loopback/preview hosts — production stays cookie-only.
        const token = readMirroredSessionCookie();
        if (token) return { Authorization: `Bearer ${token}` };
        return {};
      },
      fetch(input, init) {
        return fetchWithTimeout(
          input,
          {
            ...(init ?? {}),
            credentials: "include",
          },
          30000
        );
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
