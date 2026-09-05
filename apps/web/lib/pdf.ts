/**
 * The answer as a PDF report.
 *
 * Same rule as the CSV export: masked columns only, and every number in the
 * report is one the computation produced. It is written on the page, so nothing
 * is uploaded to make it.
 */
import { jsPDF } from "jspdf";

import type { VerifiedResultPackage } from "./orchestrator/types";
import { redactText } from "./security/redact";

interface Record_ {
  date: string;
  type: string;
  channel: string;
  counterparty: string | null;
  account_masked: string | null;
  amount: number;
}

const MARGIN = 48;
const LINE = 16;

function indian(value: number): string {
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toFixed(2).split(".");
  const last = whole.slice(-3);
  let rest = whole.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  const grouped = groups.length ? `${groups.join(",")},${last}` : last;
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

export function buildReport(pkg: VerifiedResultPackage, sql: string | undefined,
                            records: Record_[]): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  let y = MARGIN;

  const room = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Everything written into the report goes through the same redaction as the
  // CSV export, including the question the person typed, which is the one part
  // of a report that arrives unmasked. Amounts are grouped with commas, so no
  // figure in the report is long enough to be redacted.
  const text = (value: string, size: number, weight: "normal" | "bold" = "normal",
                grey = false) => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    doc.setTextColor(grey ? 110 : 26);
    for (const line of doc.splitTextToSize(redactText(value), width - MARGIN * 2)) {
      room(LINE);
      doc.text(line, MARGIN, y);
      y += size < 12 ? LINE - 3 : LINE;
    }
  };

  const rule = () => {
    room(18);
    doc.setDrawColor(224);
    doc.line(MARGIN, y, width - MARGIN, y);
    y += 18;
  };

  text("Veritas", 10, "bold", true);
  y += 4;
  text(pkg.question, 18, "bold");
  y += 6;

  const unit = pkg.answer_unit === "count" ? "" : "Rs ";
  text(`${unit}${indian(pkg.answer_value ?? 0)}`, 26, "bold");
  text(`${pkg.verdict.status}${pkg.period_label ? `  ·  ${pkg.period_label}` : ""}`, 11, "normal", true);
  y += 4;
  text(pkg.interpretation_text, 11, "normal", true);
  rule();

  if (pkg.explanation) {
    text(pkg.explanation, 11);
    y += 6;
  }

  if (pkg.alternatives.length) {
    text("Other readings of the same question", 12, "bold");
    for (const alternative of pkg.alternatives) {
      text(`${alternative.reading}: Rs ${indian(alternative.value ?? 0)}  (${alternative.variance_pct}% different)`,
           11, "normal", true);
    }
    y += 6;
  } else {
    text("Only one reading of this question applies, so the number does not move.", 11, "normal", true);
    y += 6;
  }

  if (pkg.breakdown.length) {
    rule();
    text("Breakdown", 12, "bold");
    for (const row of pkg.breakdown.slice(0, 30)) {
      room(LINE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(26);
      doc.text(redactText(String(row.key)), MARGIN, y);
      doc.text(`Rs ${indian(row.value)}`, width - MARGIN, y, { align: "right" });
      y += LINE;
    }
    y += 6;
  }

  if (records.length) {
    rule();
    text(`Evidence, first ${Math.min(records.length, 25)} of ${records.length} rows`, 12, "bold");
    for (const record of records.slice(0, 25)) {
      room(LINE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(70);
      doc.text(redactText(`${record.date.slice(0, 10)}  ${record.channel}  ${record.counterparty ?? "Unknown"}  ${record.account_masked ?? ""}`),
               MARGIN, y);
      doc.text(`Rs ${indian(record.amount)}`, width - MARGIN, y, { align: "right" });
      y += LINE - 3;
    }
    y += 6;
  }

  if (sql) {
    rule();
    text("The query that produced this", 12, "bold");
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90);
    for (const line of doc.splitTextToSize(redactText(sql), width - MARGIN * 2)) {
      room(11);
      doc.text(line, MARGIN, y);
      y += 11;
    }
  }

  rule();
  text("Account numbers and UTRs are masked to their last four characters. Every figure here was computed in the query service, not written by a language model.",
       9, "normal", true);

  return doc;
}

export function downloadReport(pkg: VerifiedResultPackage, sql: string | undefined,
                               records: Record_[]): void {
  buildReport(pkg, sql, records).save("veritas-report.pdf");
}
