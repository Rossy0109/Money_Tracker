import { spawn } from "node:child_process";
import { createConnection } from "mysql2/promise";
import { bootstrapLocalE2eSchema } from "./bootstrap-local-e2e-schema.mjs";

const sourceUrl = process.env.ISOLATED_E2E_DATABASE_URL;
if (!sourceUrl) throw new Error("ISOLATED_E2E_DATABASE_URL ছাড়া বিচ্ছিন্ন E2E পরীক্ষা চালানো যাবে না");

const source = new URL(sourceUrl);
const sourceDatabase = source.pathname.replace(/^\//, "");
const testDatabase = `money_tracker_e2e_${Date.now().toString(36)}_${process.pid}`;

if (!sourceDatabase || sourceDatabase === testDatabase || sourceDatabase.startsWith("money_tracker_e2e_") || !["127.0.0.1", "localhost"].includes(source.hostname)) {
  throw new Error("নিরাপত্তার জন্য E2E রানার কেবল স্থানীয় অ-পরীক্ষামূলক MariaDB সংযোগ ব্যবহার করবে");
}

function quoteIdentifier(identifier) {
  if (!/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(identifier)) {
    throw new Error("নিরাপদ পরীক্ষামূলক ডেটাবেসের নাম তৈরি করা যায়নি");
  }
  return `\`${identifier}\``;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} ব্যর্থ হয়েছে (exit ${code ?? "unknown"})`));
    });
  });
}

const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
const testEnv = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  ISOLATED_E2E_DATABASE: "true",
  ISOLATED_E2E_DATABASE_NAME: testDatabase,
};

let testDatabaseCreated = false;
try {
  const adminConnection = await createConnection(sourceUrl);
  try {
    await adminConnection.query(`CREATE DATABASE ${quoteIdentifier(testDatabase)}`);
    testDatabaseCreated = true;
  } finally {
    adminConnection.destroy();
  }

  await bootstrapLocalE2eSchema(testUrl.toString());
  await run("pnpm", ["vitest", "run", "--config", "vitest.e2e.config.ts"], testEnv);
  console.log(`\nবিচ্ছিন্ন E2E পরীক্ষা সফল হয়েছে: ${testDatabase}`);
} finally {
  if (testDatabaseCreated) {
    const adminConnection = await createConnection(sourceUrl);
    try {
      await adminConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabase)}`);
      console.log(`পরীক্ষামূলক ডেটাবেস নিরাপদে অপসারণ করা হয়েছে: ${testDatabase}`);
    } finally {
      adminConnection.destroy();
    }
  }
}
