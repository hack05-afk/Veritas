"use client";

/**
 * Ledger Pulse.
 *
 * Five things worth knowing before anything is asked, read as one row of
 * readings rather than five cards. Each tile is a shortcut into the
 * conversation: clicking it asks the question that produced it.
 */
import React from "react";
import { Skeleton, Sparkline, formatIndian } from "@veritas/ui";

interface Pulse {
  accounts: { count: number; banks: string[]; question: string };
  balance_check: { accounts: { account_masked: string; gap: number }[]; question: string };
  largest_debits: { items: { amount: number; counterparty: string | null; date: string }[]; question: string };
  unreferenced: { count: number; question: string };
  spikes: { items: { subject: string; ratio: number }[]; question: string };
}

/**
 * One reading: what it is, the figure, and the words that qualify it. The
 * optional trailing element is drawn only from values the pulse returned.
 */
function Tile({ label, figure, note, question, onAsk, chart, tone = "ink" }: {
  label: string;
  figure: React.ReactNode;
  note: string;
  question: string;
  onAsk: (question: string) => void;
  chart?: React.ReactNode;
  tone?: "ink" | "sensitive";
}) {
  return (
    <button type="button" data-pulse-tile onClick={() => onAsk(question)} title={question}
      className="group flex min-w-[188px] flex-1 shrink-0 flex-col justify-between gap-1 border-r border-rule px-4 py-2 text-left transition-colors duration-[var(--motion-fast)] last:border-r-0 hover:bg-surface-sunken">
      <span className="label">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span data-numeric className={`text-lg font-semibold leading-none ${tone === "sensitive" ? "text-sensitive" : "text-ink"}`}>
          {figure}
        </span>
        {chart}
      </span>
      <span className="truncate text-2xs text-ink-3">{note}</span>
    </button>
  );
}

/** A proportion drawn as a single hairline bar. Never taller than the type. */
function MicroBar({ ratio, tone = "ink" }: { ratio: number; tone?: "ink" | "sensitive" }) {
  const width = Math.max(2, Math.min(100, ratio * 100));
  return (
    <span aria-hidden="true" className="mb-1 block h-1 w-16 rounded-full bg-rule-faint">
      <span
        className={`block h-1 rounded-full ${tone === "sensitive" ? "bg-sensitive" : "bg-[hsl(var(--viz-1))]"}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function PulseStrip({ entityId, onAsk }: { entityId?: string; onAsk: (question: string) => void }) {
  const [pulse, setPulse] = React.useState<Pulse | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const url = `/api/pulse${entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ""}`;
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setPulse(data); })
      .catch(() => { if (!cancelled) setPulse(null); });
    return () => { cancelled = true; };
  }, [entityId]);

  if (!pulse) {
    return (
      <div data-pulse-strip className="flex shrink-0 overflow-x-auto border-b border-rule bg-surface">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex min-w-[188px] flex-1 flex-col gap-2 border-r border-rule px-4 py-2.5 last:border-r-0">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const gaps = pulse.balance_check.accounts.length;
  const debits = pulse.largest_debits.items;
  const largest = debits[0];
  const spike = pulse.spikes.items[0];

  return (
    <div data-pulse-strip className="flex shrink-0 overflow-x-auto border-b border-rule bg-surface">
      <Tile label="Accounts" onAsk={onAsk} question={pulse.accounts.question}
        figure={formatIndian(pulse.accounts.count)}
        note={`across ${pulse.accounts.banks.length} banks`} />

      <Tile label="Balance check" onAsk={onAsk} question={pulse.balance_check.question}
        tone={gaps ? "sensitive" : "ink"}
        figure={formatIndian(gaps)}
        note={gaps ? "accounts with an unexplained gap" : "every account reconciles"}
        chart={pulse.accounts.count > 0
          ? <MicroBar ratio={gaps / pulse.accounts.count} tone={gaps ? "sensitive" : "ink"} />
          : undefined} />

      <Tile label="Largest payment" onAsk={onAsk} question={pulse.largest_debits.question}
        figure={largest ? `₹${formatIndian(largest.amount)}` : "none"}
        note={largest ? `to ${largest.counterparty ?? "an unnamed party"}` : "no payments last month"}
        chart={debits.length > 1
          ? <Sparkline values={debits.map((item) => item.amount)} width={64} height={20} highlight={0} />
          : undefined} />

      <Tile label="Unreferenced" onAsk={onAsk} question={pulse.unreferenced.question}
        figure={formatIndian(pulse.unreferenced.count)}
        note="rows that cannot be traced" />

      <Tile label="Spend spike" onAsk={onAsk} question={pulse.spikes.question}
        tone={spike ? "sensitive" : "ink"}
        figure={spike ? `${spike.ratio}x` : "none"}
        note={spike ? spike.subject : "nothing unusual last month"} />
    </div>
  );
}
