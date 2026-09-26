import { describe, expect, it } from "vitest";
import { containsSnippet, flattenSource } from "@shared/sourceText";

describe("containsSnippet", () => {
  const source = [
    '        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4',
    '          sm:p-6 lg:p-9">',
    "          {children}",
    "        </div>",
  ].join("\n");

  it("matches across a line break between tokens", () => {
    expect(
      containsSnippet(
        source,
        'className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-9"'
      )
    ).toBe(true);
  });

  it("still requires the exact tokens", () => {
    expect(containsSnippet(source, 'className="mx-auto max-w-[1600px]"')).toBe(
      false
    );
  });

  it('treats a JSX {" "} separator as the space it stands for', () => {
    const jsx = ['      সীমার চেয়ে{" "}', "      {bdt(amount)} বেশি"].join(
      "\n"
    );
    expect(containsSnippet(jsx, "সীমার চেয়ে {bdt(amount)} বেশি")).toBe(true);
  });

  it("escapes regex metacharacters in the snippet", () => {
    expect(containsSnippet(source, "max-w-[1600px]")).toBe(true);
    expect(containsSnippet(source, "max-w-1600px")).toBe(false);
  });

  it("treats an empty snippet as present", () => {
    expect(containsSnippet(source, "   ")).toBe(true);
  });
});

describe("flattenSource", () => {
  it("collapses whitespace so dot-star patterns can span the text", () => {
    const schema = [
      '    submittedBy: int("submittedBy"),',
      '      .references(() => users.id, { onDelete: "set null" }),',
    ].join("\n");
    expect(flattenSource(schema)).toMatch(
      /submittedBy.*int.*submittedBy.*references.*set null/
    );
  });
});
