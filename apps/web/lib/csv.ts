/**
 * CSV export.
 *
 * Only masked columns leave the product, so an exported file can be shared
 * without leaking an account number or a UTR.
 */
import { redactText } from "./security/redact";

// An evidence record carries account_masked and utr_masked, and the raw bank
// narration in description. The narration and any unmasked identifier are
// dropped; the masked columns are exported, and masked again here so that a
// record which arrived unmasked cannot leak through this function.
const FORBIDDEN = ["account_number", "utr_number", "description", "narration"];
const MASK_COLUMNS = ["account_masked", "utr_masked"];

/** Last four characters only, which is the only form allowed to leave. */
function maskTail(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text.length > 4 ? text.slice(-4) : text;
}

/** A cell a spreadsheet would run as a formula. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  // Redaction runs first, so a caller who passed the wrong columns still cannot
  // put an account number or a UTR in the file. It never introduces a leading
  // character a spreadsheet would treat as a formula, so the injection guard
  // below is unaffected by it.
  const raw = value === null || value === undefined ? "" : redactText(String(value));
  // A counterparty called "=cmd|..." is text, not a formula.
  const text = FORMULA.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const safe = columns.filter((column) => !FORBIDDEN.includes(column));
  const lines = [safe.join(",")];
  for (const row of rows) {
    lines.push(safe.map((column) => cell(MASK_COLUMNS.includes(column) ? maskTail(row[column])
                                                                      : row[column])).join(","));
  }
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
