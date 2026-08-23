import { createConnection } from "mysql2/promise";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { bootstrapLocalE2eSchema } from "./bootstrap-local-e2e-schema.mjs";

const sourceUrl = process.env.ISOLATED_E2E_DATABASE_URL;
if (!sourceUrl) throw new Error("ISOLATED_E2E_DATABASE_URL ছাড়া ব্রাউজার E2E পরীক্ষা চালানো যাবে না");

const source = new URL(sourceUrl);
const testDatabase = `money_tracker_e2e_browser_${Date.now().toString(36)}_${process.pid}`;
if (!source.pathname.replace(/^\//, "") || source.pathname.replace(/^\//, "").startsWith("money_tracker_e2e_") || !["127.0.0.1", "localhost"].includes(source.hostname)) {
  throw new Error("নিরাপত্তার জন্য ব্রাউজার E2E কেবল স্থানীয় অ-পরীক্ষামূলক MariaDB সংযোগ ব্যবহার করবে");
}

function quoteIdentifier(identifier) {
  if (!/^money_tracker_e2e_browser_[a-z0-9_]{8,60}$/.test(identifier)) throw new Error("নিরাপদ ব্রাউজার E2E ডেটাবেসের নাম তৈরি করা যায়নি");
  return `\`${identifier}\``;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} ব্যর্থ হয়েছে (exit ${code ?? "unknown"})`)));
  });
}

function stopServer(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null || child.killed) return resolve();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("ব্রাউজার E2E-এর জন্য খালি লুপব্যাক পোর্ট পাওয়া যায়নি"));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(String(address.port)));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("ব্রাউজার E2E সার্ভার সময়মতো প্রস্তুত হয়নি");
}

const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
const port = await reserveLoopbackPort();
const testEnv = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  ISOLATED_E2E_DATABASE: "true",
  ISOLATED_E2E_DATABASE_NAME: testDatabase,
  VITE_PWA_E2E: "true",
  PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`,
  PORT: port,
  NODE_ENV: "development",
};

let testDatabaseCreated = false;
let server;
try {
  const adminConnection = await createConnection(sourceUrl);
  try {
    await adminConnection.query(`CREATE DATABASE ${quoteIdentifier(testDatabase)}`);
    testDatabaseCreated = true;
  } finally {
    adminConnection.destroy();
  }

  await bootstrapLocalE2eSchema(testUrl.toString());
  server = spawn("pnpm", ["exec", "tsx", "server/_core/index.ts"], { cwd: process.cwd(), env: testEnv, stdio: "inherit" });
  await waitForServer(`${testEnv.PLAYWRIGHT_BASE_URL}/`);
  await run("pnpm", ["exec", "playwright", "test", "--config", "playwright.config.ts"], testEnv);
  console.log(`\nবিচ্ছিন্ন ব্রাউজার E2E পরীক্ষা সফল হয়েছে: ${testDatabase}`);
} finally {
  await stopServer(server);
  if (testDatabaseCreated) {
    const adminConnection = await createConnection(sourceUrl);
    try {
      await adminConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabase)}`);
      console.log(`পরীক্ষামূলক ব্রাউজার E2E ডেটাবেস নিরাপদে অপসারণ করা হয়েছে: ${testDatabase}`);
    } finally {
      adminConnection.destroy();
    }
  }
}
