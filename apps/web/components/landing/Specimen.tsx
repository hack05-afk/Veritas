"use client";

/**
 * A real answer, on the cover.
 *
 * The values below are copied verbatim from fixtures/package/spend_last_month.json,
 * the same package the workspace renders when that fixture is replayed. Nothing
 * here is illustrative: the strip is drawn from the alternative readings the
 * query service actually computed, and the verdict is the one it returned.
 */
import React from "react";
import { Panel, VarianceStrip, VerdictChip, formatIndian } from "@veritas/ui";

const SPECIMEN = {
  question: "What did we spend last month?",
  answer_value: 1240000.0,
  period_label: "June 2026",
  interpretation_text:
    "Debits only, bank charges included, all accounts of the entity, calendar month",
  verdict: { status: "Sensitive" as const, thresholds: { stable: 5 } },
  alternatives: [
    { axis: "spend", reading: "net", value: 1148800.0, variance_pct: 7.35 },
    { axis: "charges", reading: "exclude", value: 1187500.0, variance_pct: 4.23 },
    { axis: "period", reading: "trailing", value: 1305200.0, variance_pct: 5.26 },
  ],
};

export function Specimen() {
  return (
    <Panel
      title="One answer, as it comes back"
      meta="replayed from a stored result package"
      bodyClassName="p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span data-numeric className="text-2xl font-semibold tracking-tight">
          ₹{formatIndian(SPECIMEN.answer_value, true)}
        </span>
        <span className="text-xs text-ink-3">{SPECIMEN.period_label}</span>
        <VerdictChip status={SPECIMEN.verdict.status} />
      </div>

      <p className="mt-2 text-sm text-ink-2">{SPECIMEN.interpretation_text}</p>

      <div className="mt-5">
        <span className="label">Where the other readings land</span>
        <div className="mt-2">
          <VarianceStrip
            primary={SPECIMEN.answer_value}
            readings={SPECIMEN.alternatives.map((alternative) => ({
              label: alternative.reading,
              value: alternative.value,
              variance_pct: alternative.variance_pct,
            }))}
            materialityPct={SPECIMEN.verdict.thresholds.stable}
          />
        </div>
      </div>

      <ul className="mt-4 divide-y divide-rule-faint border-t border-rule">
        {SPECIMEN.alternatives.map((alternative) => (
          <li
            key={`${alternative.axis}-${alternative.reading}`}
            className="flex items-baseline justify-between gap-4 py-1.5 text-sm"
          >
            <span className="text-ink-2">
              Read as <span className="text-ink">{alternative.reading}</span>
            </span>
            <span className="flex items-baseline gap-3">
              <span data-numeric className="text-ink">
                ₹{formatIndian(alternative.value, true)}
              </span>
              <span data-numeric className="w-14 text-right text-xs text-ink-3">
                {alternative.variance_pct}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
