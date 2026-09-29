import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  firmHeaderHtml,
  moneyBn,
  noDataHtml,
  numberBn,
  printDate,
  printDateTime,
  reportGeneratedMeta,
  signatureBlockHtml,
  totalsTableHtml,
} from "./layout";

const firm = {
  name: "Test <Firm>",
  tagline: "tag",
  address: "addr",
  phone: "01",
  email: "a@b.c",
};

describe("escapeHtml", () => {
  it("escapes all special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(123)).toBe("123");
  });
});

describe("moneyBn / numberBn", () => {
  it("formats Bengali amounts", () => {
    expect(moneyBn(1500).startsWith("৳ ")).toBe(true);
    expect(moneyBn(1500)).toContain("১,৫০০.০০");
    expect(numberBn("2500.5")).toContain("২,৫০০.৫");
  });
});

describe("printDate / printDateTime", () => {
  it("returns non-empty Bengali date strings", () => {
    expect(printDate("2026-01-15").length).toBeGreaterThan(0);
    expect(printDateTime("2026-01-15T10:30:00").length).toBeGreaterThan(0);
  });
});

describe("firmHeaderHtml", () => {
  it("escapes firm content and renders title plus meta", () => {
    const html = firmHeaderHtml(firm, {
      title: "Report <X>",
      meta: [{ label: "L", value: "V" }],
    });
    expect(html).toContain("Test &lt;Firm&gt;");
    expect(html).toContain("Report &lt;X&gt;");
    expect(html).toContain("meta-value");
    expect(html).not.toContain("<X>");
  });

  it("renders the optional subtitle", () => {
    expect(
      firmHeaderHtml(firm, { title: "T", meta: [], subtitle: "Sub" })
    ).toContain("doc-subtitle");
  });
});

describe("signatureBlockHtml / totalsTableHtml / noDataHtml", () => {
  it("renders three signature columns", () => {
    expect(signatureBlockHtml().match(/sig-col/g)!.length).toBe(3);
  });

  it("applies tone classes and escapes content", () => {
    const html = totalsTableHtml([
      { label: "A", value: "1", tone: "grand" },
      { label: "B", value: "2", tone: "income" },
      { label: "C", value: "3", tone: "expense" },
      { label: "<D>", value: "4" },
    ]);
    expect(html).toContain("grand-total");
    expect(html.match(/section-total/g)!.length).toBe(2);
    expect(html).toContain("&lt;D&gt;");
  });

  it("renders the default and custom empty message", () => {
    expect(noDataHtml()).toContain("কোনো লেনদেন");
    expect(noDataHtml("<oops>")).toContain("&lt;oops&gt;");
  });
});

describe("reportGeneratedMeta", () => {
  it("returns the four standard rows", () => {
    const rows = reportGeneratedMeta(firm, { name: "P" }, "Jan");
    expect(rows.map(r => r.label)).toEqual([
      "প্রজেক্ট",
      "সময়কাল",
      "ফার্ম",
      "তৈরির সময়",
    ]);
    expect(rows[0].value).toBe("P");
  });
});
