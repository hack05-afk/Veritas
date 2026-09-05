"use client";

/**
 * Provenance.
 *
 * The claim this product makes is that every number on screen came from
 * somewhere specific. This makes that claim clickable: any figure wrapped in
 * <Figure> knows which template produced it, how many rows it read, and which
 * allowed_numbers entry it corresponds to. Hovering lights up the lineage;
 * clicking opens it.
 *
 * A figure that is NOT in allowed_numbers renders as ungrounded and says so.
 * That is deliberate: the failure is meant to be visible, not swallowed.
 */

import React from "react";
import { formatIndian } from "../format";

export interface Provenance {
  /** The query template that produced it, e.g. spend_total. */
  template?: string;
  /** Rows the computation read. */
  rowCount?: number;
  /** The window the figure covers. */
  period?: string;
  /** Which filters were in force. */
  filters?: Record<string, unknown>;
  /** The SQL, with placeholders rather than values. */
  sql?: string;
  /** Alternative readings of the same question. */
  readings?: { label: string; value: number }[];
}

interface Ctx {
  allowed: number[];
  provenance: Provenance;
  active: string | null;
  setActive: (id: string | null) => void;
  onInspect?: (id: string, provenance: Provenance) => void;
}

const ProvenanceContext = React.createContext<Ctx | null>(null);

export function ProvenanceScope({
  allowed,
  provenance,
  onInspect,
  children,
}: {
  allowed: number[];
  provenance: Provenance;
  onInspect?: (id: string, provenance: Provenance) => void;
  children: React.ReactNode;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({ allowed, provenance, active, setActive, onInspect }),
    [allowed, provenance, active, onInspect],
  );
  return <ProvenanceContext.Provider value={value}>{children}</ProvenanceContext.Provider>;
}

/** Two floats agree when they agree to the paisa. */
function isAllowed(value: number, allowed: number[]): boolean {
  return allowed.some((candidate) => Math.abs(candidate - value) < 0.005);
}

/**
 * A figure with its lineage attached.
 *
 * `id` groups figures that are the same quantity, so hovering one in the
 * headline also lights the same quantity in the table below it.
 */
export function Figure({
  value,
  id,
  decimals = true,
  prefix = "₹",
  className = "",
}: {
  value: number;
  id?: string;
  decimals?: boolean;
  prefix?: string;
  className?: string;
}) {
  const ctx = React.useContext(ProvenanceContext);
  const key = id ?? String(value);
  const grounded = ctx ? isAllowed(value, ctx.allowed) : true;
  const lit = ctx?.active === key;

  return (
    <span
      data-kit="Figure"
      data-numeric
      data-figure={key}
      data-grounded={grounded ? "true" : "false"}
      tabIndex={0}
      role="button"
      title={
        grounded
          ? "Click to trace this number back to the rows it came from"
          : "This figure is not in the computation's allowed numbers"
      }
      onMouseEnter={() => ctx?.setActive(key)}
      onMouseLeave={() => ctx?.setActive(null)}
      onFocus={() => ctx?.setActive(key)}
      onBlur={() => ctx?.setActive(null)}
      onClick={() => ctx?.onInspect?.(key, ctx.provenance)}
      className={
        "cursor-pointer rounded-[var(--radius-sm)] underline decoration-dotted underline-offset-[3px] " +
        "transition-colors duration-[var(--motion-fast)] " +
        (grounded
          ? lit
            ? "bg-[hsl(var(--accent-soft))] decoration-[hsl(var(--accent))] text-[hsl(var(--ink))]"
            : "decoration-[hsl(var(--ink-4))] hover:bg-[hsl(var(--accent-soft))]"
          : "bg-[hsl(var(--fragile-soft))] decoration-[hsl(var(--fragile))] text-[hsl(var(--fragile))]") +
        ` ${className}`
      }
    >
      {prefix}
      {formatIndian(value, decimals)}
      {grounded ? null : <span className="ml-1 text-[length:var(--text-2xs)]">ungrounded</span>}
    </span>
  );
}

/** The lineage of one figure, laid out as a chain rather than a list. */
export function ProvenanceTrail({ provenance }: { provenance: Provenance }) {
  const steps: { label: string; value: React.ReactNode }[] = [
    { label: "Question", value: "read into a structured plan by the model" },
    {
      label: "Template",
      value: <span data-mono>{provenance.template ?? "unknown"}</span>,
    },
    {
      label: "Window",
      value: provenance.period ?? "not restricted",
    },
    {
      label: "Rows read",
      value: (
        <span data-numeric>{formatIndian(provenance.rowCount ?? 0)}</span>
      ),
    },
    {
      label: "Computed by",
      value: "DuckDB, from an approved template with bound parameters",
    },
    {
      label: "Checked against",
      value: `${provenance.readings?.length ?? 0} alternative readings`,
    },
  ];

  return (
    <ol data-kit="ProvenanceTrail" className="relative ml-1.5 border-l border-[hsl(var(--rule))] pl-4">
      {steps.map((step) => (
        <li key={step.label} className="relative pb-3 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute -left-[21px] top-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--ink-3))]"
          />
          <span className="label block">{step.label}</span>
          <span className="mt-0.5 block text-[length:var(--text-sm)] text-[hsl(var(--ink-2))]">
            {step.value}
          </span>
        </li>
      ))}
      {provenance.sql ? (
        <li className="relative pt-1">
          <span
            aria-hidden="true"
            className="absolute -left-[21px] top-2.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]"
          />
          <span className="label block">The query itself</span>
          <pre
            data-mono
            className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[hsl(var(--rule))] bg-[hsl(var(--surface-sunken))] p-2 text-[length:var(--text-2xs)] leading-relaxed text-[hsl(var(--ink-2))]"
          >
            {provenance.sql}
          </pre>
        </li>
      ) : null}
    </ol>
  );
}
