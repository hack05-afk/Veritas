/**
 * CSV export.
 *
 * Only masked columns leave the product, so an exported file can be shared
 * without leaking an account number or a UTR.
 */
const FORBIDDEN = ["account_number", "utr_number", "description"];

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const safe = columns.filter((column) => !FORBIDDEN.includes(column));
  const lines = [safe.join(",")];
  for (const row of rows) lines.push(safe.map((column) => cell(row[column])).join(","));
  return lines.join("\n");
}

/** Hand the visitor a file without ever sending it anywhere. */
export function download(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
