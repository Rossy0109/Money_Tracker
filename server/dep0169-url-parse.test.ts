import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveProjectRoot } from "../dirname.ts";

vi.mock("./_core/queryTiming", () => ({
  instrumentPool: vi.fn(),
}));

const projectRoot = resolveProjectRoot(import.meta.url);

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".next",
]);

/** Test files are excluded from the scan (they mention url.parse in names). */
function isTestFile(file: string): boolean {
  return /\.test\.|\.spec\.|\.e2e\./.test(file);
}

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        collectSourceFiles(full, files);
      }
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !isTestFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function findUrlParseCalls(dir: string): string[] {
  const files = collectSourceFiles(path.join(projectRoot, dir));
  const offenders: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) {
        continue;
      }
      if (
        /url\.parse\s*\(/.test(line) &&
        !line.includes("parseurl") &&
        !line.includes("parseString") &&
        !line.includes("parseUrl") &&
        !line.includes("parseHost")
      ) {
        offenders.push(`${file}:${i + 1}: ${line}`);
      }
    }
  }
  return offenders;
}

describe("F-02: url.parse() usage in application code", () => {
  it("contains no url.parse() calls in server/ source files", () => {
    expect(findUrlParseCalls("server")).toEqual([]);
  });

  it("contains no url.parse() calls in client/src/ source files", () => {
    expect(findUrlParseCalls("client/src")).toEqual([]);
  });

  it("contains no url.parse() calls in scripts/", () => {
    expect(findUrlParseCalls("scripts")).toEqual([]);
  });

  it("contains no url.parse() calls in shared/ source files", () => {
    expect(findUrlParseCalls("shared")).toEqual([]);
  });

  it("parseDatabaseUrl uses WHATWG URL API, not url.parse", () => {
    const dbConnPath = path.join(projectRoot, "server", "_core", "dbConnection.ts");
    const content = fs.readFileSync(dbConnPath, "utf-8");
    expect(content).toContain("new URL(");
    expect(content).not.toMatch(/url\.parse\s*\(/);
  });

  it("dbConnection.ts comment references WHATWG URL API", () => {
    const dbConnPath = path.join(projectRoot, "server", "_core", "dbConnection.ts");
    const content = fs.readFileSync(dbConnPath, "utf-8");
    expect(content).toContain("WHATWG URL");
  });
});

describe("F-02: url.parse() runtime behavior", () => {
  it("url.parse is a function (available but deprecated)", async () => {
    const url = await import("node:url");
    expect(typeof url.parse).toBe("function");
  });

  it("new URL() works as the WHATWG replacement", () => {
    const parsed = new URL("http://localhost:3306/db?ssl=true");
    expect(parsed.hostname).toBe("localhost");
    expect(parsed.port).toBe("3306");
    expect(parsed.pathname).toBe("/db");
    expect(parsed.searchParams.get("ssl")).toBe("true");
  });

  it("new URL() handles unencoded JSON query params (TiDB case)", () => {
    const parsed = new URL(
      'mysql://user:pass@host:3306/db?ssl={"rejectUnauthorized":true}'
    );
    expect(parsed.hostname).toBe("host");
    expect(parsed.searchParams.get("ssl")).toBe('{"rejectUnauthorized":true}');
  });

  it("new URL() handles jdbc: prefix after stripping", () => {
    const stripped = "jdbc:mysql://user:pass@host:3306/db".replace(/^jdbc:/i, "");
    const parsed = new URL(stripped);
    expect(parsed.hostname).toBe("host");
    expect(parsed.port).toBe("3306");
  });
});
