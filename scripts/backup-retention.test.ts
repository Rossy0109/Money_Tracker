import { describe, expect, it } from "vitest";
import {
  parseBackupObjectName,
  selectPrunableObjects,
  summarizePlan,
} from "./lib/backup-retention.mjs";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");

function backup(project: string, date: string, size = 1024) {
  return { name: `${project}-backup-${date}-aabbccdd.enc.json`, size };
}

function daysAgo(days: number) {
  const ms = new Date(NOW - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return ms;
}

describe("parseBackupObjectName", () => {
  it("splits a real backup filename", () => {
    expect(
      parseBackupObjectName("project-30001-backup-2026-10-01-7e294ef1.enc.json")
    ).toMatchObject({
      project: "project-30001",
      date: "2026-10-01",
      checksum: "7e294ef1",
    });
  });

  it("keeps a hyphenated project name intact", () => {
    expect(
      parseBackupObjectName("amar-hisab-backup-2026-09-30-70aefc91.enc.json")
        ?.project
    ).toBe("amar-hisab");
  });

  it("returns null for anything that is not a backup", () => {
    for (const name of [
      "__probe2.json",
      "README",
      "notes.txt",
      "project-1-backup-2026-10-01.enc.json",
      "project-1-backup-20261001-aabbccdd.enc.json",
      "project-1-backup-2026-13-45-aabbccdd.enc.json",
      "project-1-backup-2026-10-01-zzz.enc.json",
      "project-1-backup-2026-10-01-aabbccdd.enc.json.gz",
      "",
      null,
      undefined,
    ]) {
      expect(parseBackupObjectName(name as any)).toBeNull();
    }
  });
});

describe("selectPrunableObjects", () => {
  it("deletes nothing inside the retention window", () => {
    const plan = selectPrunableObjects(
      [backup("p1", daysAgo(1)), backup("p1", daysAgo(5))],
      { retentionDays: 90, keepPerProject: 2, now: NOW }
    );
    expect(plan.delete).toHaveLength(0);
    expect(plan.keep).toHaveLength(2);
  });

  it("deletes objects older than the window", () => {
    const plan = selectPrunableObjects(
      [backup("p1", daysAgo(200)), backup("p1", daysAgo(2))],
      { retentionDays: 90, keepPerProject: 1, now: NOW }
    );
    expect(plan.delete.map((o) => o.name)).toEqual([
      backup("p1", daysAgo(200)).name,
    ]);
  });

  it("keeps the newest per project even when every object is ancient", () => {
    const objects = [
      backup("p1", "2020-01-01"),
      backup("p1", "2020-01-02"),
      backup("p1", "2020-01-03"),
      backup("p2", "2019-01-01"),
    ];
    const plan = selectPrunableObjects(objects, {
      retentionDays: 90,
      keepPerProject: 2,
      now: NOW,
    });

    // Newest two per project survive on age alone.
    const kept = plan.keep.map((o) => o.name);
    expect(kept).toContain(backup("p1", "2020-01-03").name);
    expect(kept).toContain(backup("p1", "2020-01-02").name);
    expect(kept).toContain(backup("p2", "2019-01-01").name);
    expect(kept).toHaveLength(3);
  });

  it("never returns an empty delete set for a single old backup", () => {
    const plan = selectPrunableObjects([backup("p1", "2019-05-05")], {
      retentionDays: 1,
      keepPerProject: 1,
      now: NOW,
    });
    expect(plan.delete).toHaveLength(0);
  });

  it("applies the floor even when every object is past the window", () => {
    // All five are far older than retentionDays; only the floor may survive.
    const objects = Array.from({ length: 5 }, (_, i) =>
      backup("p1", `2026-09-0${i + 1}`)
    );
    const plan = selectPrunableObjects(objects, {
      retentionDays: 1,
      keepPerProject: 3,
      now: NOW,
    });
    expect(plan.keep).toHaveLength(3);
    expect(plan.delete).toHaveLength(2);
    // The survivors are the three newest, not an arbitrary three.
    expect(plan.keep.map((o) => o.name)).toEqual([
      backup("p1", "2026-09-05").name,
      backup("p1", "2026-09-04").name,
      backup("p1", "2026-09-03").name,
    ]);
  });

  it("rejects a sub-day retention window outright", () => {
    expect(() =>
      selectPrunableObjects([], { retentionDays: 0.0001, now: NOW })
    ).toThrow(RangeError);
  });

  it("ignores unrecognized objects entirely", () => {
    const plan = selectPrunableObjects(
      [{ name: "__probe2.json", size: 10 }, { name: "keep-me.txt", size: 5 }],
      { retentionDays: 1, keepPerProject: 1, now: NOW }
    );
    expect(plan.delete).toHaveLength(0);
    expect(plan.unrecognized).toEqual(["__probe2.json", "keep-me.txt"]);
  });

  it("counts same-day backups separately and keeps the right ones", () => {
    const objects = [
      { name: "p1-backup-2026-01-01-aaaaaaaa.enc.json", size: 1 },
      { name: "p1-backup-2026-01-01-bbbbbbbb.enc.json", size: 1 },
      { name: "p1-backup-2026-01-01-cccccccc.enc.json", size: 1 },
      { name: "p1-backup-2026-01-01-dddddddd.enc.json", size: 1 },
    ];
    const plan = selectPrunableObjects(objects, {
      retentionDays: 90,
      keepPerProject: 1,
      now: NOW,
    });
    // One survivor, chosen deterministically by the name tie-break.
    expect(plan.keep.map((o) => o.name)).toEqual([
      "p1-backup-2026-01-01-dddddddd.enc.json",
    ]);
    expect(plan.delete).toHaveLength(3);
  });

  it("applies the floor per project, not globally", () => {
    const objects = [
      ...Array.from({ length: 4 }, (_, i) => backup("p1", `2020-01-0${i + 1}`)),
      ...Array.from({ length: 4 }, (_, i) => backup("p2", `2020-01-0${i + 1}`)),
    ];
    const plan = selectPrunableObjects(objects, {
      retentionDays: 90,
      keepPerProject: 2,
      now: NOW,
    });
    expect(plan.keep).toHaveLength(4);
    expect(plan.delete).toHaveLength(4);
  });

  it("rejects nonsense options rather than guessing", () => {
    expect(() =>
      selectPrunableObjects([], { retentionDays: 0, now: NOW })
    ).toThrow(RangeError);
    expect(() =>
      selectPrunableObjects([], { retentionDays: -5, now: NOW })
    ).toThrow(RangeError);
    expect(() =>
      selectPrunableObjects([], {
        retentionDays: 90,
        keepPerProject: 0,
        now: NOW,
      })
    ).toThrow(RangeError);
    expect(() =>
      selectPrunableObjects([], { retentionDays: 90, now: Number.NaN })
    ).toThrow(RangeError);
  });

  it("treats an undefined object list as empty", () => {
    const plan = selectPrunableObjects(undefined, {
      retentionDays: 90,
      now: NOW,
    });
    expect(plan.delete).toHaveLength(0);
  });
});

describe("summarizePlan", () => {
  it("reports counts and reclaimable bytes", () => {
    const plan = selectPrunableObjects(
      [
        backup("p1", daysAgo(300), 500),
        backup("p1", daysAgo(2), 700),
        { name: "__probe2.json", size: 42 },
      ],
      { retentionDays: 90, keepPerProject: 1, now: NOW }
    );

    expect(summarizePlan(plan)).toEqual({
      deleteCount: 1,
      keepCount: 1,
      unrecognizedCount: 1,
      deleteBytes: 500,
      keepBytes: 700,
    });
  });
});