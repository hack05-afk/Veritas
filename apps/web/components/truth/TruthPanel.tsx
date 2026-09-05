"use client";

/**
 * The Truth Panel.
 *
 * The number first and plainly, then how it was read, then whether any other
 * reasonable reading would move it.
 */
import React from "react";
import { Card, CountUp, DataTable, Tabs, VerdictChip, type Column } from "@veritas/ui";

import { EvidenceDrawer, type EvidenceRecord } from "@/components/evidence/EvidenceDrawer";
import { download, toCsv } from "@/lib/csv";
import { downloadReport } from "@/lib/pdf";
import type { VerifiedResultPackage } from "@/lib/orchestrator/types";

const BREAKDOWN: Column[] = [
  { key: "key", label: "Key" },
  { key: "value", label: "Amount", numeric: true, decimals: true },
  { key: "count", label: "Rows" },
];

export function TruthPanel({ pkg, sql, records, filters }: {
  pkg: VerifiedResultPackage;
  sql?: string;
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
}) {
  const exportCsv = () => {
    const csv = records.length
      ? toCsv(["transaction_id", "date", "type", "channel", "counterparty", "account_masked",
               "reference_id", "utr_masked", "amount"], records as unknown as Record<string, unknown>[])
      : toCsv(["key", "value", "count"], pkg.breakdown as unknown as Record<string, unknown>[]);
    download("veritas-export.csv", csv);
  };

  return (
    <Card data-truth-panel className="mt-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <span data-answer-value className="text-answer font-semibold tracking-tight">
          <CountUp value={pkg.answer_value ?? 0} decimals />
        </span>
        {pkg.period_label ? (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{pkg.period_label}</span>
        ) : null}
        <VerdictChip status={pkg.verdict.status} />
      </div>

      <p data-interpretation className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
        {pkg.interpretation_text}
      </p>
      {pkg.explanation ? <p className="mt-4 text-base leading-relaxed">{pkg.explanation}</p> : null}

      {pkg.anomalies.length ? (
        <p className="mt-3 rounded-[var(--radius)] bg-[hsl(var(--warning-soft))] px-3 py-2 text-sm text-[hsl(var(--warning-text))]">
          {pkg.anomalies[0].subject} was paid {pkg.anomalies[0].ratio} times its recent average.
        </p>
      ) : null}

      {pkg.alternatives.length ? (
        <ul className="mt-5 space-y-2">
          {pkg.alternatives.map((alternative) => (
            <li key={`${alternative.axis}-${alternative.reading}`} data-alternative className="text-sm">
              Read as <strong className="font-medium">{alternative.reading}</strong> it is{" "}
              <span data-numeric>{(alternative.value ?? 0).toLocaleString("en-IN")}</span>, a difference of{" "}
              <span data-numeric>{alternative.variance_pct}</span> percent.
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
          Only one reading of this question applies, so the number does not move.
        </p>
      )}

      <div className="mt-7">
        <Tabs tabs={[
          { label: "Breakdown", content: pkg.breakdown.length
              ? <DataTable columns={BREAKDOWN} rows={pkg.breakdown as unknown as Record<string, unknown>[]} />
              : <p className="text-sm text-[hsl(var(--muted-foreground))]">This answer has no breakdown.</p> },
          { label: "Records", content: <EvidenceDrawer records={records} filters={filters} sql={sql} /> },
          { label: "Query", content: (
              <pre data-sql data-mono className="overflow-auto whitespace-pre-wrap break-words text-xs">
                {sql ?? "No query was run."}
              </pre>
            ) },
        ]} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={exportCsv}
          className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--brand-soft))]">
          Export CSV
        </button>
        <button type="button" onClick={() => downloadReport(pkg, sql, records)}
          className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--brand-soft))]">
          Download PDF report
        </button>
      </div>
    </Card>
  );
}
