import "./loadEnv";
import { createServer } from "http";
import net from "net";
import { createApiApp } from "./app";
import { ensureAuthModeConsistency, validateCriticalEnv } from "./env";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const missingEnv = validateCriticalEnv();
  if (missingEnv.length > 0) {
    throw new Error(
      `FATAL: Missing critical environment variables: ${missingEnv.join(", ")}. ` +
        "Set them in .env or your deployment environment.",
    );
  }

  const consistency = ensureAuthModeConsistency();
  if (!consistency.ok) {
    throw new Error(
      `AUTH_MODE=${consistency.serverMode} and VITE_AUTH_MODE=${consistency.clientMode} must match. ` +
        "Set both to the same value in the same environment layer (.env / .env.development.local / Vercel).",
    );
  }
  const app = createApiApp();
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
