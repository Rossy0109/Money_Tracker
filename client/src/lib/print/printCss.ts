/**
 * Professional A4 print stylesheet used both by the standalone print window
 * and by the in-app preview. Print-specific rules hide the toolbar, use @page
 * footers for page numbers, repeat table headers via table-header-group and
 * keep rows from being split awkwardly between pages.
 */
export const PRINT_CSS = `
@font-face {
  font-family: 'Noto Sans Bengali';
  src: url('/fonts/NotoSansBengali-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans Bengali', 'Segoe UI', Tahoma, sans-serif;
  color: #17241f;
  background: #eef0ec;
  font-size: 12px;
  line-height: 1.5;
}
.print-root {
  max-width: 210mm;
  margin: 0 auto;
  background: #ffffff;
  padding: 10mm 12mm;
}
.print-root h1, .print-root h2, .print-root h3, .print-root p, .print-root table {
  margin: 0;
}
.firm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 2.5px solid #173f36;
  padding-bottom: 8px;
  margin-bottom: 8px;
}
.firm-header .firm-block { text-align: left; }
.firm-header .firm-logo {
  height: 46px;
  width: 46px;
  object-fit: contain;
}
.firm-header .firm-name {
  font-size: 17px;
  font-weight: 800;
  color: #173f36;
  letter-spacing: 0.3px;
}
.firm-header .firm-tagline {
  font-size: 10.5px;
  color: #4f6b60;
}
.firm-header .firm-contact {
  font-size: 9px;
  color: #64786e;
  text-align: right;
  white-space: pre-line;
}
.doc-title {
  text-align: center;
  font-size: 15px;
  font-weight: 800;
  color: #10281f;
  margin: 2px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.doc-subtitle {
  text-align: center;
  font-size: 11px;
  color: #33483f;
  margin-bottom: 8px;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px 24px;
  border: 1px solid #cfd9d3;
  border-radius: 6px;
  padding: 7px 10px;
  margin-bottom: 10px;
  font-size: 10.5px;
  background: #f7faf8;
}
.meta-grid .meta-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.meta-grid .meta-row .meta-label { color: #52665c; }
.meta-grid .meta-row .meta-value { font-weight: 700; color: #15312a; text-align: right; }
table.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
}
table.report-table thead {
  display: table-header-group;
}
table.report-table th {
  background: #173f36;
  color: #fff;
  font-weight: 700;
  padding: 5px 6px;
  text-align: left;
  border: 1px solid #173f36;
  font-size: 10px;
}
table.report-table th.ser { width: 6%; }
table.report-table th.num { text-align: right; }
table.report-table th.date { width: 12%; white-space: nowrap; }
table.report-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
table.report-table td {
  border: 1px solid #d7dfda;
  padding: 4px 6px;
  vertical-align: top;
}
table.report-table tbody tr:nth-child(even) { background: #f6f9f7; }
table.report-table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.totals { margin: 10px 0 4px; }
table.total-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
  margin-left: auto;
  max-width: 300mm;
}
table.total-table td {
  border: 1px solid #c6d2cb;
  padding: 4px 6px;
}
table.total-table tr.section-total td {
  background: #eef5f0;
  font-weight: 700;
  color: #173f36;
}
table.total-table tr.grand-total td {
  background: #dcebe2;
  font-weight: 800;
  color: #0f2f26;
}
table.total-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.number-row th {
  background: #e4ede7;
  color: #173f36;
  text-align: right;
}
.category-group-head td {
  background: #edf4ef;
  font-weight: 700;
  color: #25493c;
}
.notes { margin-top: 8px; font-size: 9px; color: #5a6f65; }
.signatures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 34px;
  padding-top: 6px;
}
.sig-col { text-align: center; font-size: 10px; color: #2c4439; }
.sig-col .sig-line {
  border-top: 1px solid #5f7569;
  margin-bottom: 5px;
}
.sig-col .sig-label { font-weight: 700; }
.sig-col .sig-sub { font-size: 8.5px; color: #71837a; }
.voucher-doc { font-size: 12px; }
.voucher-doc .voucher-head {}
.voucher-table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
.voucher-table td { border: 1px solid #33493f; padding: 7px 8px; vertical-align: top; }
.voucher-table td .field-label { font-size: 9.5px; color: #5a6f65; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.voucher-table td .field-value { font-weight: 700; color: #132b23; font-size: 12px; min-height: 17px; }
.voucher-table .amount-cell { background: #f4f8f5; text-align: right; }
.voucher-table .amount-cell .amount-digits { font-size: 20px; font-weight: 800; color: #0f2f26; }
.voucher-table .bordered { }
.voucher-table td.col-letter { width: 18%; }
.voucher-table td.col-value { width: 32%; }
.voucher-sig {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 26px;
}
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: #173f36;
  color: #fff;
  padding: 8px 12px;
  font-family: 'Noto Sans Bengali', sans-serif;
}
.print-toolbar .tb-title { font-weight: 700; flex: 1; font-size: 12px; }
.print-toolbar button {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.print-toolbar .btn-print { background: #d8f2dd; color: #113a30; }
.print-toolbar .btn-pdf { background: #ffffff; color: #113a30; }
.print-toolbar .btn-close { background: #3d5c52; color: #eafff2; }
@media print {
  body { background: #ffffff; }
  .print-toolbar { display: none !important; }
  .print-root { max-width: none; padding: 0; }
  @page { size: A4 portrait; margin: 13mm 11mm 15mm 11mm; }
  @page {
    @bottom-center {
      content: "পৃষ্ঠা " counter(page);
      font-size: 8pt;
      color: #6b7d73;
    }
  }
}
@media screen and (max-width: 640px) {
  body { font-size: 10px; }
  .print-root { padding: 6mm; }
  .meta-grid { grid-template-columns: 1fr; }
  .signatures, .voucher-sig { grid-template-columns: 1fr; gap: 12px; }
}
`;
