"use client";

/**
 * The Truth Panel.
 *
 * The number first and plainly, then how it was read, then whether any other
 * reasonable reading would move it. Everything below the headline is built out
 * of the package the query service returned: no figure on this panel is
 * estimated, interpolated or filled in.
 *
 * The inquiry surfaces can live here as tabs, or be lifted into the workspace
 * rail. `inquiry` decides which, so the same answer is never shown twice.
 */
import React from "react";
import {
  AdversarialAudit,
  Button,
  Chip,
  DataTable,
  Drawer,
  Figure,
  ProvenanceScope,
  ProvenanceTrail,
  Tabs,
  TimeScrub,
  VarianceStrip,
  VerdictChip,
  WhatIf,
  type Column,
  type Provenance,
} from "@veritas/ui";

import { EvidenceDrawer, type EvidenceRecord } from "@/components/evidence/EvidenceDrawer";
import { rewindow, strongestCounter, toAttacks, toAxes, toBuckets } from "@/components/truth/derive";
import { download, toCsv } from "@/lib/csv";
import { downloadReport } from "@/lib/pdf";
import type { QueryPlan, VerifiedResultPackage } from "@/lib/orchestrator/types";

const BREAKDOWN: Column[] = [
  { key: "key", label: "Key" },
  { key: "value", label: "Amount", numeric: true, decimals: true },
  { key: "count", label: "Rows", numeric: true, plain: true },
];

/** The lineage of the figures on this panel, read off the plan and the run. */
export function toProvenance(
  pkg: VerifiedResultPackage,
  records: EvidenceRecord[],
  filters: Record<string, unknown>,
  sql?: string,
  plan?: QueryPlan,
): Provenance {
  return {
    template: plan?.intent ?? plan?.metric,
    rowCount: records.length,
    period: pkg.period_label ?? undefined,
    filters,
    sql,
    readings: pkg.alternatives.map((alternative) => ({
      label: alternative.reading,
      value: alternative.value ?? 0,
    })),
  };
}

export function TruthPanel({
  pkg,
  sql,
  records,
  filters,
  plan,
  inquiry = true,
  onInspect,
  onAsk,
}: {
  pkg: VerifiedResultPackage;
  sql?: string;
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
  plan?: QueryPlan;
  /** False when the workspace rail is showing the inquiry surfaces instead. */
  inquiry?: boolean;
  /** Given, a clicked figure opens in the rail rather than in a local drawer. */
  onInspect?: (id: string, provenance: Provenance) => void;
  onAsk?: (question: string) => void;
}) {
  const [trail, setTrail] = React.useState<Provenance | null>(null);

  const provenance = React.useMemo(
    () => toProvenance(pkg, records, filters, sql, plan),
    [pkg, records, filters, sql, plan],
  );

  const axes = React.useMemo(() => toAxes(pkg, plan), [pkg, plan]);
  const attacks = React.useMemo(() => toAttacks(pkg), [pkg]);
  const strongest = React.useMemo(() => strongestCounter(pkg), [pkg]);
  const buckets = React.useMemo(() => toBuckets(pkg, plan), [pkg, plan]);

  const exportCsv = () => {
    const csv = records.length
      ? toCsv(["transaction_id", "date", "type", "channel", "counterparty", "account_masked",
               "reference_id", "utr_masked", "amount"], records as unknown as Record<string, unknown>[])
      : toCsv(["key", "value", "count"], pkg.breakdown as unknown as Record<string, unknown>[]);
    download("veritas-export.csv", csv);
  };

  const tabs: { label: string; badge?: React.ReactNode; content: React.ReactNode }[] = [
    {
      label: "Breakdown",
      badge: pkg.breakdown.length || undefined,
      content: pkg.breakdown.length ? (
        <DataTable
          columns={BREAKDOWN}
          rows={pkg.breakdown as unknown as Record<string, unknown>[]}
          maxHeight="320px"
        />
      ) : (
        <p className="text-sm text-ink-3">This answer has no breakdown.</p>
      ),
    },
    {
      label: "Records",
      badge: records.length || undefined,
      content: <EvidenceDrawer records={records} filters={filters} sql={sql} />,
    },
    {
      label: "Query",
      content: (
        <pre data-sql data-mono className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-sm border border-rule bg-surface-sunken p-3 text-2xs leading-relaxed text-ink-2">
          {sql ?? "No query was run."}
        </pre>
      ),
    },
  ];

  if (inquiry) {
    tabs.push(
      {
        label: "What if",
        badge: axes.length || undefined,
        content: (
          <WhatIf
            primary={pkg.answer_value ?? 0}
            axes={axes}
            materialityPct={pkg.verdict.thresholds.stable}
          />
        ),
      },
      {
        label: "Audit",
        badge: attacks.length,
        content: <AdversarialAudit attacks={attacks} strongest={strongest} />,
      },
    );
    if (buckets) {
      tabs.push({
        label: "Over time",
        badge: buckets.length,
        content: (
          <TimeScrub
            buckets={buckets}
            window={buckets.map((bucket) => bucket.key)}
            onCommit={onAsk ? (from, to) => onAsk(rewindow(pkg.question, from, to)) : undefined}
          />
        ),
      });
    }
  }

  return (
    <ProvenanceScope
      allowed={pkg.allowed_numbers}
      provenance={provenance}
      onInspect={onInspect ?? ((_id, found) => setTrail(found))}
    >
      <section data-truth-panel className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span data-answer-value className="text-answer font-semibold">
            <Figure value={pkg.answer_value ?? 0} id="answer" />
          </span>
          {pkg.period_label ? <span className="text-xs text-ink-3">{pkg.period_label}</span> : null}
          <VerdictChip status={pkg.verdict.status} />
        </div>

        <p data-interpretation className="mt-2 text-sm text-ink-2">
          {pkg.interpretation_text}
        </p>
        {pkg.explanation ? <p className="mt-3 text-base text-ink">{pkg.explanation}</p> : null}

        {pkg.anomalies.length ? (
          <p className="mt-3 rounded-sm border border-sensitive bg-sensitive-soft px-2.5 py-1.5 text-sm text-sensitive">
            {pkg.anomalies[0].subject} was paid{" "}
            <span data-numeric>{pkg.anomalies[0].ratio}</span> times its recent average.
          </p>
        ) : null}

        {pkg.alternatives.length ? (
          <div className="mt-5 border-t border-rule pt-4">
            <span className="label">Where the other readings land</span>
            <div className="mt-2">
              <VarianceStrip
                primary={pkg.answer_value ?? 0}
                readings={pkg.alternatives.map((alternative) => ({
                  label: alternative.reading,
                  value: alternative.value ?? 0,
                  variance_pct: alternative.variance_pct,
                }))}
                materialityPct={pkg.verdict.thresholds.stable}
              />
            </div>
            <ul className="mt-3 divide-y divide-rule-faint">
              {pkg.alternatives.map((alternative) => (
                <li
                  key={`${alternative.axis}-${alternative.reading}`}
                  data-alternative
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5 text-sm"
                >
                  <span className="text-ink-2">
                    Read as <span className="font-medium text-ink">{alternative.reading}</span> it is
                  </span>
                  <span className="flex items-baseline gap-3">
                    <Figure
                      value={alternative.value ?? 0}
                      id={`${alternative.axis}-${alternative.reading}`}
                    />
                    <span data-numeric className="w-16 text-right text-xs text-ink-3">
                      {alternative.variance_pct} percent
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 border-t border-rule pt-4 text-sm text-ink-3">
            Only one reading of this question applies, so the number does not move.
          </p>
        )}

        <div className="mt-5 border-t border-rule pt-1">
          <Tabs tabs={tabs} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-rule pt-3">
          <Button variant="secondary" size="sm" data-export-csv onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" size="sm" onClick={() => downloadReport(pkg, sql, records)}>
            Download PDF report
          </Button>
          <Chip tone="quiet">
            <span data-numeric>{pkg.allowed_numbers.length}</span> figures grounded
          </Chip>
        </div>

        {trail ? (
          <div className="fixed inset-y-0 right-0 z-40 flex shadow-2">
            <Drawer open title="Where this number came from" onClose={() => setTrail(null)}>
              <ProvenanceTrail provenance={trail} />
            </Drawer>
          </div>
        ) : null}
      </section>
    </ProvenanceScope>
  );
}
