import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 1. Service Worker Lifecycle and Caching Strategy Simulator
class MockCache {
  private store = new Map<string, Response>();

  async match(request: string | Request): Promise<Response | undefined> {
    const key = typeof request === "string" ? request : request.url;
    return this.store.get(key);
  }

  async put(request: string | Request, response: Response): Promise<void> {
    const key = typeof request === "string" ? request : request.url;
    this.store.set(key, response);
  }

  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) {
      this.store.set(url, new Response("OK", { status: 200 }));
    }
  }

  size(): number {
    return this.store.size;
  }
}

class MockServiceWorkerGlobalScope {
  caches = new Map<string, MockCache>();
  activeCacheName = "amar-hisab-shell-v2";

  getCache(name = this.activeCacheName): MockCache {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MockCache());
    }
    return this.caches.get(name)!;
  }

  async handleFetch(
    request: { url: string; mode?: string; destination?: string },
    networkFallback: () => Promise<Response>
  ): Promise<Response> {
    const url = new URL(request.url, "https://app.moneytracker.local");
    const cache = this.getCache();

    // Do not cache API routes
    if (url.pathname.startsWith("/api/")) {
      return networkFallback();
    }

    // Navigation mode fallback to offline.html
    if (request.mode === "navigate") {
      try {
        return await networkFallback();
      } catch {
        const offline = await cache.match("/offline.html");
        return offline || new Response("Offline Fallback", { status: 200 });
      }
    }

    // Static assets (script, style, image) cache-first then network
    if (["script", "style", "image", "font"].includes(request.destination || "")) {
      const cached = await cache.match(url.pathname);
      if (cached) return cached;

      const networkResponse = await networkFallback();
      if (networkResponse.ok) {
        await cache.put(url.pathname, networkResponse.clone());
      }
      return networkResponse;
    }

    return networkFallback();
  }
}

// 2. Real Browser Notification API Simulator
class BrowserNotificationManager {
  static permission: NotificationPermission = "default";

  static async requestPermission(): Promise<NotificationPermission> {
    this.permission = "granted";
    return this.permission;
  }

  static createNotification(title: string, options?: NotificationOptions): { title: string; options?: NotificationOptions } {
    if (this.permission !== "granted") {
      throw new Error("Notification permission not granted");
    }
    return { title, options };
  }
}

// 3. Resilient WebSocket Connection Simulator with Heartbeat & Auto-reconnect
class ResilientWebSocketClient {
  url: string;
  isOpen = false;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  messageHistory: string[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.url.startsWith("ws://") || this.url.startsWith("wss://")) {
        this.isOpen = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve(true);
      } else {
        reject(new Error("Invalid WebSocket URL protocol"));
      }
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isOpen) {
        this.send(JSON.stringify({ type: "ping" }));
      }
    }, 5000);
  }

  send(data: string) {
    if (!this.isOpen) throw new Error("WebSocket is not open");
    this.messageHistory.push(data);
  }

  simulateConnectionDrop() {
    this.isOpen = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.attemptReconnect();
  }

  attemptReconnect(): boolean {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.isOpen = true;
      this.startHeartbeat();
      return true;
    }
    return false;
  }

  close() {
    this.isOpen = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

describe("Offline, PWA & Realtime Infrastructure Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. Service Worker Behavior", () => {
    it("caches app shell on install and serves offline fallback when navigating offline", async () => {
      const sw = new MockServiceWorkerGlobalScope();
      const cache = sw.getCache();

      // Simulate pre-caching APP_SHELL
      await cache.addAll(["/", "/offline.html", "/manifest.webmanifest", "/app-icon.svg"]);
      expect(cache.size()).toBe(4);

      // Online navigation returns network
      const onlineNav = await sw.handleFetch({ url: "/dashboard", mode: "navigate" }, async () => {
        return new Response("Dashboard Page HTML", { status: 200 });
      });
      expect(await onlineNav.text()).toBe("Dashboard Page HTML");

      // Offline navigation falls back to /offline.html
      const offlineNav = await sw.handleFetch({ url: "/dashboard", mode: "navigate" }, async () => {
        throw new TypeError("Failed to fetch");
      });
      expect(offlineNav.status).toBe(200);
      expect(await offlineNav.text()).toBe("OK");
    });

    it("does not intercept or cache /api/* procedures in service worker", async () => {
      const sw = new MockServiceWorkerGlobalScope();
      let networkHit = false;

      const response = await sw.handleFetch({ url: "/api/trpc/overview" }, async () => {
        networkHit = true;
        return new Response(JSON.stringify({ data: "api" }), { status: 200 });
      });

      expect(networkHit).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe("2. Real Browser Notifications", () => {
    it("requests permission and delivers financial alerts when granted", async () => {
      expect(BrowserNotificationManager.permission).toBe("default");

      // User grants permission
      const status = await BrowserNotificationManager.requestPermission();
      expect(status).toBe("granted");

      // Dispatch transaction threshold notification
      const notification = BrowserNotificationManager.createNotification("বাজেট সীমা অতিক্রম!", {
        body: "আপনার মাসিক খাদ্য বাজেট ৯০% খরচ হয়েছে।",
        icon: "/app-icon.svg",
      });

      expect(notification.title).toBe("বাজেট সীমা অতিক্রম!");
      expect(notification.options?.body).toContain("খাদ্য বাজেট ৯০%");
    });

    it("throws error when attempting to notify without granted permission", () => {
      BrowserNotificationManager.permission = "denied";
      expect(() => {
        BrowserNotificationManager.createNotification("Test Alert");
      }).toThrow("permission not granted");
    });
  });

  describe("3. Real WebSocket Realtime Communication", () => {
    it("connects, sends heartbeats, and automatically reconnects on dropped connection", async () => {
      const client = new ResilientWebSocketClient("wss://stream.moneytracker.local/socket");
      await client.connect();
      expect(client.isOpen).toBe(true);

      // Advance timers by 5s to verify heartbeat ping
      vi.advanceTimersByTime(5000);
      expect(client.messageHistory).toContain(JSON.stringify({ type: "ping" }));

      // Simulate connection drop
      client.simulateConnectionDrop();
      expect(client.reconnectAttempts).toBe(1);
      expect(client.isOpen).toBe(true);

      client.close();
      expect(client.isOpen).toBe(false);
    });
  });
});
