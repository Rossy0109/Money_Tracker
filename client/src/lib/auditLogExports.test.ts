import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = [
  {
    id: 1,
    action: "login" as const,
    entityType: "auth",
    entityId: null,
    summary: 'User "Ahmmed" logged in, with comma',
    createdAt: "2026-10-01T10:00:00.000Z",
    actorUserId: 7,
    actorName: "আহমেদ",
    projectId: 3,
    projectName: "মূল প্রকল্প",
  },
  {
    id: 2,
    action: "create" as const,
    entityType: "voucher",
    entityId: 12,
    summary: "Voucher posted",
    createdAt: new Date("2026-10-02T12:30:00.000Z"),
    actorUserId: 8,
    actorName: null,
    projectId: null,
    projectName: null,
  },
];

let clicked: { href: string; download: string };
let createObjectURL: ReturnType<typeof vi.fn<(input: Blob | MediaSource) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

beforeEach(() => {
  createObjectURL = vi.fn((_input: Blob | MediaSource) => "blob:audit");
  revokeObjectURL = vi.fn((_input: string) => {});
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);

  clicked = { href: "", download: "" };
  const link = {
    set href(value: string) {
      clicked.href = value;
    },
    get href() {
      return clicked.href;
    },
    set download(value: string) {
      clicked.download = value;
    },
    get download() {
      return clicked.download;
    },
    click: vi.fn(),
  };
  vi.stubGlobal("document", { createElement: () => link });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("downloadAuditCsv", () => {
  it("emits a BOM-prefixed CSV with the Bengali header row", async () => {
    const { downloadAuditCsv } = await import("./auditLogExports");
    downloadAuditCsv(rows);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Excel needs the UTF-8 BOM (EF BB BF) as the first bytes of the file.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blob.text();
    // Header has 6 quoted Bengali columns, then a newline and the data rows.
    const [headerLine] = text.split("\n");
    expect(headerLine!.split(",")).toHaveLength(6);
    expect(headerLine!.startsWith('"')).toBe(true);
    // Two data rows were requested.
    expect(text.split("\n").filter(line => line.trim()).length).toBe(3);
  });

  it("escapes embedded quotes and commas", async () => {
    const { downloadAuditCsv } = await import("./auditLogExports");
    downloadAuditCsv(rows);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await blob.text();
    // Quotes are doubled inside a quoted field.
    expect(text).toContain('""Ahmmed""');
    expect(text).toContain("login");
  });

  it("falls back to a synthetic actor label and an em dash for the project", async () => {
    const { downloadAuditCsv } = await import("./auditLogExports");
    downloadAuditCsv(rows);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await blob.text();
    expect(text).toContain("User #8");
    expect(text).toContain("—");
  });

  it("names the file with the current date and cleans up the object URL", async () => {
    const { downloadAuditCsv } = await import("./auditLogExports");
    downloadAuditCsv([]);
    expect(clicked.href).toBe("blob:audit");
    expect(clicked.download).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit");
  });
});

describe("downloadAuditPdf", () => {
  const docMethods = [
    "setFontSize",
    "text",
    "setFillColor",
    "rect",
    "line",
    "setDrawColor",
    "addPage",
    "splitTextToSize",
    "addFileToVFS",
    "addFont",
    "setFont",
    "save",
  ] as const;

  function stubDoc() {
    const calls: Record<string, unknown[][]> = {};
    for (const method of docMethods) calls[method] = [];
    return {
      calls,
      setFontSize: vi.fn((...a: unknown[]) => void calls.setFontSize.push(a)),
      text: vi.fn((...a: unknown[]) => void calls.text.push(a)),
      setFillColor: vi.fn((...a: unknown[]) => void calls.setFillColor.push(a)),
      rect: vi.fn((...a: unknown[]) => void calls.rect.push(a)),
      line: vi.fn((...a: unknown[]) => void calls.line.push(a)),
      setDrawColor: vi.fn((...a: unknown[]) => void calls.setDrawColor.push(a)),
      addPage: vi.fn((...a: unknown[]) => void calls.addPage.push(a)),
      splitTextToSize: vi.fn((value: string) => [value]),
      addFileToVFS: vi.fn((...a: unknown[]) => void calls.addFileToVFS.push(a)),
      addFont: vi.fn((...a: unknown[]) => void calls.addFont.push(a)),
      setFont: vi.fn((...a: unknown[]) => void calls.setFont.push(a)),
      save: vi.fn((...a: unknown[]) => void calls.save.push(a)),
    };
  }

  async function withJsPdfStub(doc: ReturnType<typeof stubDoc>) {
    // jsPDF is invoked with `new`, so the stub must be a constructor.
    function JsPdfStub() {
      return doc;
    }
    vi.doMock("jspdf", () => ({ jsPDF: JsPdfStub }));
    return import("./auditLogExports");
  }

  beforeEach(() => {
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      }),
    });
  });

  it("registers the Bengali font and renders the header", async () => {
    const doc = stubDoc();
    const { downloadAuditPdf } = await withJsPdfStub(doc);
    await downloadAuditPdf(rows);

    expect(doc.calls.addFileToVFS).toHaveLength(1);
    expect(doc.calls.addFont).toHaveLength(1);
    expect(doc.calls.setFont.length).toBeGreaterThan(0);
    expect(doc.calls.text.length).toBeGreaterThan(0);
    expect(doc.calls.save).toHaveLength(1);
    expect(doc.calls.save[0][0]).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("throws a Bengali error when the font cannot be loaded", async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const doc = stubDoc();
    const { downloadAuditPdf } = await withJsPdfStub(doc);
    await expect(downloadAuditPdf(rows)).rejects.toThrow(
      "PDF ফন্ট লোড করা যায়নি"
    );
  });

  it("adds a page and redraws the header when rows overflow", async () => {
    const doc = stubDoc();
    const manyRows = Array.from({ length: 60 }, (_, index) => ({
      ...rows[0],
      id: index + 1,
      summary: `Row number ${index}`,
    }));
    const { downloadAuditPdf } = await withJsPdfStub(doc);
    await downloadAuditPdf(manyRows);

    expect(doc.calls.addPage.length).toBeGreaterThan(0);
    // Header is drawn once per page.
    expect(doc.calls.rect.length).toBeGreaterThan(1);
  });

  it("renders an empty export without throwing", async () => {
    const doc = stubDoc();
    const { downloadAuditPdf } = await withJsPdfStub(doc);
    await expect(downloadAuditPdf([])).resolves.toBeUndefined();
    expect(doc.calls.save).toHaveLength(1);
  });
});