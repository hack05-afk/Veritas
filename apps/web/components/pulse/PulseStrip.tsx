"use client";

/**
 * Ledger Pulse.
 *
 * Five things worth knowing before anything is asked. Each tile is a shortcut
 * into the conversation: clicking it asks the question that produced it.
 */
import React from "react";
import { Skeleton, formatIndian } from "@veritas/ui";

interface Pulse {
  accounts: { count: number; banks: string[]; question: string };
  balance_check: { accounts: { account_masked: string; gap: number }[]; question: string };
  largest_debits: { items: { amount: number; counterparty: string | null; date: string }[]; question: string };
  unreferenced: { count: number; question: string };
  spikes: { items: { subject: string; ratio: number }[]; question: string };
}

function Tile({ title, detail, question, onAsk }: {
  title: string; detail: string; question: string; onAsk: (question: string) => void;
}) {
  return (
    <button type="button" data-pulse-tile onClick={() => onAsk(question)} title={question}
      className="min-w-[210px] shrink-0 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-[hsl(var(--brand-soft))]">
      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{title}</span>
      <span className="mt-1 block text-sm font-medium">{detail}</span>
    </button>
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
      <div data-pulse-strip className="flex gap-2 overflow-x-auto border-b border-[hsl(var(--border))] px-6 py-3">
        {[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-14 w-[210px] shrink-0" />)}
      </div>
    );
  }

  const gaps = pulse.balance_check.accounts.length;
  const largest = pulse.largest_debits.items[0];
  const spike = pulse.spikes.items[0];

  return (
    <div data-pulse-strip className="flex gap-2 overflow-x-auto border-b border-[hsl(var(--border))] px-6 py-3">
      <Tile title="Accounts" onAsk={onAsk} question={pulse.accounts.question}
        detail={`${pulse.accounts.count} across ${pulse.accounts.banks.length} banks`} />
      <Tile title="Balance check" onAsk={onAsk} question={pulse.balance_check.question}
        detail={gaps ? `${gaps} with an unexplained gap` : "Every account reconciles"} />
      <Tile title="Largest payment" onAsk={onAsk} question={pulse.largest_debits.question}
        detail={largest ? `₹${formatIndian(largest.amount)} to ${largest.counterparty ?? "an unnamed party"}`
                        : "No payments last month"} />
      <Tile title="Unreferenced" onAsk={onAsk} question={pulse.unreferenced.question}
        detail={`${formatIndian(pulse.unreferenced.count)} rows cannot be traced`} />
      <Tile title="Spend spike" onAsk={onAsk} question={pulse.spikes.question}
        detail={spike ? `${spike.subject} at ${spike.ratio} times usual` : "Nothing unusual last month"} />
    </div>
  );
}
