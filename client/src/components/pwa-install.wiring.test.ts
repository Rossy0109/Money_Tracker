import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const installButtonSource = readFileSync(
  resolve(process.cwd(), "client/src/components/PwaInstallButton.tsx"),
  "utf8"
);
const clientShell = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
const clientBootstrap = readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8");
const manifest = readFileSync(resolve(process.cwd(), "client/public/manifest.webmanifest"), "utf8");
const serviceWorker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");

describe("installable mobile application wiring", () => {
  it("exposes a Bengali home-screen install control with iOS instructions", () => {
    expect(installButtonSource).toContain("beforeinstallprompt");
    expect(installButtonSource).toContain("মোবাইলের হোমস্ক্রিনে অ্যাপ যোগ করুন");
    expect(installButtonSource).toContain("হোম স্ক্রিনে যোগ করুন");
  });

  it("publishes standalone manifest metadata and registers the offline shell in production or the explicit isolated-browser test mode", () => {
    expect(clientShell).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(manifest).toContain('"display": "standalone"');
    expect(manifest).toContain('"start_url": "/"');
    expect(clientBootstrap).toContain('import.meta.env.PROD || import.meta.env.VITE_PWA_E2E === "true"');
    expect(clientBootstrap).toContain('if (shouldRegisterServiceWorker && "serviceWorker" in navigator)');
    expect(clientBootstrap).toContain('navigator.serviceWorker.register("/sw.js")');
  });

  it("never caches finance API requests in the offline shell", () => {
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('request.mode === "navigate"');
  });
});
