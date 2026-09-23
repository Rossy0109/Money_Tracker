import { PRINT_CSS } from "./printCss";

export type PrintResult =
  | { status: "opened"; window: Window }
  | { status: "blocked" };

/**
 * Opens a clean, standalone print window with only the report document and the
 * professional A4 print stylesheet. The user gets the browser Print dialog
 * (which also offers "Save as PDF"), while a toolbar keeps Screen/Preview
 * usable inside the window itself.
 */
export function openPrintWindow(options: {
  title: string;
  bodyHtml: string;
  toolbarHtml?: string;
}): PrintResult {
  const win = window.open("", "_blank", "noopener,width=920,height=1100");
  if (!win) return { status: "blocked" };

  const documentHtml = `<!doctype html>
<html lang="bn">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title.replace(/[<>&"]/g, "")}</title>
    <style>${PRINT_CSS}</style>
  </head>
  <body>
    <div class="print-toolbar">
      <span class="tb-title">${options.title.replace(/[<>&"]/g, "")}</span>
      <button type="button" class="btn-print" onclick="window.print()">প্রিন্ট / PDF</button>
      <button type="button" class="btn-close" onclick="window.close()">বন্ধ করুন</button>
    </div>
    ${options.toolbarHtml ?? ""}
    <div class="print-root">${options.bodyHtml}</div>
    <script>
      window.addEventListener("afterprint", function () { window.focus(); });
    </script>
  </body>
</html>`;

  const doc = win.document;
  doc.open();
  doc.write(documentHtml);
  doc.close();
  return { status: "opened", window: win };
}

/**
 * Attempts to print immediately after the document finishes rendering. Called
 * by the print window's own toolbar as well, so direct printing is optional.
 */
export function triggerPrint(win: Window | null): void {
  win?.focus();
  win?.print();
}