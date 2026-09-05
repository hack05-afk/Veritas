"use client";

import React from "react";
import { formatIndian } from "../format";

export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  masked?: boolean;
  decimals?: boolean;
  /** Rendered without a rupee prefix. For counts, ratios and row numbers. */
  plain?: boolean;
  width?: string;
}

/**
 * A dense ledger table.
 *
 * Rules rather than zebra striping: banding implies grouping that is not there.
 * The header is sticky because these tables are read by scrolling, and numeric
 * columns are right aligned and monospaced so magnitudes compare by eye.
 */
export function DataTable({
  columns,
  rows,
  caption,
  maxHeight = "none",
  onRowClick,
  activeRow,
}: {
  columns: Column[];
  rows: Record<string, unknown>[];
  caption?: string;
  maxHeight?: string;
  onRowClick?: (row: Record<string, unknown>, index: number) => void;
  activeRow?: number | null;
}) {
  return (
    <div
      data-kit="DataTable"
      className="overflow-auto rounded-[var(--radius-sm)] border border-[hsl(var(--rule))]"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-[length:var(--text-sm)]">
        {caption ? (
          <caption className="border-b border-[hsl(var(--rule))] bg-[hsl(var(--surface-sunken))] px-3 py-1.5 text-left text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">
            {caption}
          </caption>
        ) : null}
        <thead className="sticky top-0 z-10">
          <tr className="bg-[hsl(var(--surface-sunken))]">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={
                  "border-b border-[hsl(var(--rule))] px-3 py-2 text-[length:var(--text-2xs)] font-semibold " +
                  "uppercase tracking-[var(--tracking-label)] text-[hsl(var(--ink-3))] " +
                  (column.numeric ? "text-right" : "text-left")
                }
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-[length:var(--text-xs)] text-[hsl(var(--ink-3))]"
              >
                No rows.
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => (
            <tr
              key={index}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              data-active={activeRow === index ? "true" : undefined}
              className={
                "border-b border-[hsl(var(--rule-faint))] last:border-0 " +
                (onRowClick ? "cursor-pointer " : "") +
                (activeRow === index
                  ? "bg-[hsl(var(--accent-soft))]"
                  : "hover:bg-[hsl(var(--surface-sunken))]")
              }
            >
              {columns.map((column) => {
                const value = row[column.key];
                if (column.numeric) {
                  const number = Number(value ?? 0);
                  return (
                    <td key={column.key} data-numeric className="px-3 py-1.5 text-right tabular-nums">
                      {column.plain
                        ? formatIndian(number, column.decimals)
                        : `₹${formatIndian(number, column.decimals)}`}
                    </td>
                  );
                }
                return (
                  <td
                    key={column.key}
                    {...(column.masked ? { "data-masked": "" } : {})}
                    className="max-w-[22ch] truncate px-3 py-1.5"
                    title={String(value ?? "")}
                  >
                    {String(value ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Tabs as a segmented control. The underline variant reads as navigation; this
 * is a view switch over one object, which is a different thing.
 */
export function Tabs({
  tabs,
  initial = 0,
  right,
}: {
  tabs: { label: string; badge?: React.ReactNode; content: React.ReactNode }[];
  initial?: number;
  right?: React.ReactNode;
}) {
  const [active, setActive] = React.useState(initial);
  return (
    <div data-kit="Tabs" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--rule))]">
        <div role="tablist" className="flex items-center gap-0.5 p-1">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              role="tab"
              type="button"
              data-tab={tab.label}
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={
                "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 " +
                "text-[length:var(--text-xs)] font-medium transition-colors duration-[var(--motion-fast)] " +
                (index === active
                  ? "bg-[hsl(var(--ink))] text-[hsl(var(--surface))]"
                  : "text-[hsl(var(--ink-3))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink))]")
              }
            >
              {tab.label}
              {tab.badge !== undefined ? (
                <span data-numeric className="text-[length:var(--text-2xs)] opacity-70">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {right ? <div className="pr-2">{right}</div> : null}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 pt-3">
        {tabs[active]?.content}
      </div>
    </div>
  );
}

/** A right-hand inspector. Slides over the canvas, never over the conversation. */
export function Drawer({
  open,
  title,
  meta,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  meta?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <aside
      data-kit="Drawer"
      aria-label={title}
      className="flex h-full w-[560px] max-w-full flex-col border-l border-[hsl(var(--rule))] bg-[hsl(var(--surface))]"
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--rule))] px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="label truncate">{title}</h2>
          {meta ? <span className="truncate text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">{meta}</span> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--text-xs)] text-[hsl(var(--ink-3))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink))]"
          >
            Close
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
