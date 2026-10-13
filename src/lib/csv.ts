// CSV export that opens cleanly in Excel and Google Sheets: UTF-8 with BOM,
// CRLF line endings, every field quoted, nested data as JSON text.
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // keep spreadsheets from treating text as a formula
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
