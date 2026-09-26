/**
 * Source-text helpers for the wiring tests.
 *
 * Those tests assert that a component, route or schema contains a given
 * snippet. Comparing raw text made them fail whenever a formatter re-wrapped a
 * line — `label: "…", href: "…"` split over two lines no longer matched a
 * single-line needle — so the comparison tolerates whitespace differences.
 */

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prettier rewrites JSX text runs that straddle a line break as
 * `…text{" "}` followed by the next expression, so a snippet written as one
 * space no longer appears literally. Turning that marker back into a space
 * makes the comparison independent of where the formatter wrapped the line.
 */
function normalizeJsxTextSeparators(source: string): string {
  return source.replace(/\{\s*"\s*"\s*\}/g, " ");
}

/**
 * True when `snippet`'s tokens appear in `source` in the same order, allowing
 * any run of whitespace between them.
 *
 * Prefer this over `expect(source).toContain(snippet)`: it keeps a wiring
 * assertion meaningful when a formatter reflows the surrounding code, while
 * still requiring the exact tokens and punctuation the test is about.
 */
export function containsSnippet(source: string, snippet: string): boolean {
  const tokens = snippet.trim().split(/\s+/);
  if (tokens.length === 0) return true;
  const pattern = tokens.map(escapeForRegExp).join("\\s*");
  return new RegExp(pattern).test(normalizeJsxTextSeparators(source));
}

/**
 * Collapses every whitespace run to a single space, so a multi-line source
 * becomes one line.
 *
 * Use it before matching a hand-written `/a.*b/` pattern: `.` does not cross
 * newlines, so those patterns only work against flattened text.
 */
export function flattenSource(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
