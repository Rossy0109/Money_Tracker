import { describe, expect, it } from "vitest";
import {
  checkWorkflow,
  checkWorkflows,
  PERSIST_CREDENTIALS_ALLOWLIST,
} from "./check-workflow-hardening.mjs";

const HEAD = `
name: X
on: [push]
permissions: {}
concurrency:
  group: x
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@${"a".repeat(40)} # actions/checkout@v7
        with:
          persist-credentials: false
`;

describe("checkWorkflow", () => {
  it("accepts a fully-hardened workflow", () => {
    expect(checkWorkflow("x.yml", HEAD)).toEqual([]);
  });

  it("flags a missing permissions block", () => {
    const src = HEAD.replace("permissions: {}\n", "");
    expect(checkWorkflow("x.yml", src).join("\n")).toContain("permissions");
  });

  it("flags a missing concurrency block", () => {
    const src = HEAD.replace(/concurrency:[\s\S]*?group: x\n/, "");
    expect(checkWorkflow("x.yml", src).join("\n")).toContain("concurrency");
  });

  it("flags a job without timeout-minutes", () => {
    const src = HEAD.replace("    timeout-minutes: 10\n", "");
    expect(checkWorkflow("x.yml", src).join("\n")).toContain("timeout-minutes");
  });

  it("flags a mutable tag ref", () => {
    const src = HEAD.replace(`actions/checkout@${"a".repeat(40)}`, "actions/checkout@v7");
    expect(checkWorkflow("x.yml", src).join("\n")).toContain("not a full 40-char SHA");
  });

  it("flags checkout without persist-credentials: false", () => {
    const src = HEAD.replace("        with:\n          persist-credentials: false\n", "");
    expect(checkWorkflow("x.yml", src).join("\n")).toContain("persist-credentials: false");
  });

  it("allows the persist-credentials allowlist to keep the token", () => {
    const src = HEAD.replace("        with:\n          persist-credentials: false\n", "");
    const allowlisted = [...PERSIST_CREDENTIALS_ALLOWLIST.keys()][0];
    expect(checkWorkflow(allowlisted, src)).toEqual([]);
  });
});

describe("checkWorkflows (live gate)", () => {
  it("the repository's workflows pass the hardening checks", () => {
    const dir = new URL("../.github/workflows", import.meta.url).pathname;
    const { ok, errors } = checkWorkflows(dir);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });
});
