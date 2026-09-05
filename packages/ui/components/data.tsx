"use client";

import React from "react";
import { formatIndian } from "../format";

export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  masked?: boolean;
  decimals?: boolean;
}

export function DataTable({ columns, rows, caption }: {
  columns: Column[];
  rows: Record<string, unknown>[];
  caption?: string;
}) {
  return (
    <div data-kit="DataTable" className="overflow-x-auto rounded-[var(--radius)] border border-[hsl(var(--border))]">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="px-4 py-2 text-left text-xs text-[hsl(var(--muted-foreground))]">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
            {columns.map((column) => (
              <th key={column.key} scope="col"
                className={`px-4 py-2 font-medium text-[hsl(var(--muted-foreground))] ${column.numeric ? "text-right" : "text-left"}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-[hsl(var(--border))] last:border-0">
              {columns.map((column) => {
                const value = row[column.key];
                if (column.numeric) {
                  return (
                    <td key={column.key} data-numeric className="px-4 py-2 text-right">
                      {`₹${formatIndian(Number(value ?? 0), column.decimals)}`}
                    </td>
                  );
                }
                return (
                  <td key={column.key} {...(column.masked ? { "data-masked": "" } : {})} className="px-4 py-2">
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

export function Tabs({ tabs, initial = 0 }: { tabs: { label: string; content: React.ReactNode }[]; initial?: number }) {
  const [active, setActive] = React.useState(initial);
  return (
    <div data-kit="Tabs">
      <div role="tablist" className="flex gap-1 border-b border-[hsl(var(--border))]">
        {tabs.map((tab, index) => (
          <button key={tab.label} role="tab" type="button" aria-selected={index === active}
            onClick={() => setActive(index)}
            className={`px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)] ${
              index === active ? "border-b-2 border-[hsl(var(--brand))] text-[hsl(var(--brand-text))]"
                               : "text-[hsl(var(--muted-foreground))]"}`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">{tabs[active]?.content}</div>
    </div>
  );
}

export function Drawer({ open, title, onClose, children }: {
  open: boolean; title: string; onClose?: () => void; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <aside data-kit="Drawer" aria-label={title}
      className="flex h-full w-[560px] max-w-full flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {onClose ? (
          <button type="button" onClick={onClose}
            className="rounded-[var(--radius)] px-2 py-1 text-sm text-[hsl(var(--muted-foreground))]">Close</button>
        ) : null}
      </header>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}
