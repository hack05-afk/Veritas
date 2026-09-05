"use client";

/** The rows behind a number, paginated and masked, with the filters that selected them. */
import React from "react";
import { Chip, DataTable, Drawer, type Column } from "@veritas/ui";

export interface EvidenceRecord {
  transaction_id: string;
  date: string;
  type: string;
  amount: number;
  channel: string;
  counterparty: string | null;
  account_masked: string | null;
  reference_id: string | null;
  utr_masked: string | null;
  parse_confidence: number;
}

const COLUMNS: Column[] = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "channel", label: "Channel" },
  { key: "counterparty", label: "Counterparty" },
  { key: "account_masked", label: "Account", masked: true },
  { key: "utr_masked", label: "UTR", masked: true },
  { key: "amount", label: "Amount", numeric: true, decimals: true },
];

const PAGE_SIZE = 50;

export function EvidenceDrawer({ records, filters, sql, onClose }: {
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
  sql?: string;
  onClose?: () => void;
}) {
  const [page, setPage] = React.useState(1);
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const shown = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chips = Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);

  return (
    <div data-evidence-drawer className="h-[560px] w-[560px] max-w-full">
      <Drawer open title="Evidence" onClose={onClose}>
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.length ? chips.map((chip) => (
            <span key={chip} data-filter-chip><Chip>{chip}</Chip></span>
          )) : <span data-filter-chip><Chip>No filters applied</Chip></span>}
        </div>

        <DataTable columns={COLUMNS} rows={shown.map((record) => ({
          ...record,
          date: record.date.slice(0, 10),
          counterparty: record.counterparty ?? "Unknown",
          account_masked: record.account_masked ?? "",
          utr_masked: record.utr_masked ?? "",
        }))} />

        <div className="mt-4 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>{records.length} rows</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-40">Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>

        {sql ? (
          <button type="button" onClick={() => navigator.clipboard?.writeText(sql)}
            className="mt-4 text-xs text-[hsl(var(--brand-text))]">Copy as SQL</button>
        ) : null}
      </Drawer>
    </div>
  );
}
