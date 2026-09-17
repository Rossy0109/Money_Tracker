import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileDown } from "lucide-react";
import { PRINT_CSS } from "@/lib/print/printCss";

/**
 * Reusable document preview used by the Reports page and the voucher dialog.
 * The report is rendered inside a sandboxed same-origin iframe so the print
 * stylesheet never leaks into the app UI; the exact same markup is what the
 * print window prints, so preview === printout.
 */
export function PrintPreviewFrame({
  html,
  title,
  busy,
  printLabel = "প্রিন্ট / PDF",
  onPrint,
  onPdf,
}: {
  html: string;
  title: string;
  busy?: boolean;
  printLabel?: string;
  onPrint: () => void;
  onPdf?: () => void;
}) {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html lang="bn"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${PRINT_CSS}</style></head><body>${html}</body></html>`,
    [html]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onPrint}
          disabled={busy}
          className="h-10 rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
        >
          <Printer className="mr-1.5 h-4 w-4" />
          {printLabel}
        </Button>
        {onPdf && (
          <Button
            onClick={onPdf}
            disabled={busy}
            variant="outline"
            className="h-10 rounded-xl border-[#dce7e0] text-[#173f36]"
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            PDF ডাউনলোড
          </Button>
        )}
      </div>
      <div className="overflow-auto rounded-2xl border border-[#dce7e0] bg-[#e8ebe6] p-3">
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          className="mx-auto block h-[70vh] min-h-[540px] w-full max-w-[210mm] border-0 bg-white shadow-lg"
        />
      </div>
    </div>
  );
}