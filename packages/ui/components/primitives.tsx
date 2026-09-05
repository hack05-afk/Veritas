"use client";

import React from "react";

/* ------------------------------------------------------------------ Button */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium " +
  "whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--motion-fast)] " +
  "disabled:opacity-40 disabled:pointer-events-none";

const BUTTON_VARIANT: Record<string, string> = {
  primary:
    "bg-[hsl(var(--ink))] text-[hsl(var(--surface))] hover:bg-[hsl(var(--ink-2))]",
  secondary:
    "border border-[hsl(var(--rule-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--ink))] " +
    "hover:border-[hsl(var(--ink-3))] hover:bg-[hsl(var(--surface-sunken))]",
  ghost:
    "text-[hsl(var(--ink-2))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink))]",
  accent:
    "bg-[hsl(var(--accent))] text-white hover:bg-[hsl(var(--accent-hover))]",
};

const BUTTON_SIZE: Record<string, string> = {
  sm: "h-7 px-2.5 text-[length:var(--text-xs)]",
  md: "h-9 px-3.5 text-[length:var(--text-base)]",
  lg: "h-11 px-5 text-[length:var(--text-base)]",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      data-kit="Button"
      data-variant={variant}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- Chip */

const CHIP_TONE: Record<string, string> = {
  neutral: "border-[hsl(var(--rule))] bg-[hsl(var(--surface))] text-[hsl(var(--ink-2))]",
  quiet: "border-transparent bg-[hsl(var(--surface-sunken))] text-[hsl(var(--ink-3))]",
  brand: "border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]",
  success: "border-transparent bg-[hsl(var(--stable-soft))] text-[hsl(var(--stable))]",
  warning: "border-transparent bg-[hsl(var(--sensitive-soft))] text-[hsl(var(--sensitive))]",
  danger: "border-transparent bg-[hsl(var(--fragile-soft))] text-[hsl(var(--fragile))]",
};

export function Chip({
  tone = "neutral",
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "quiet" | "brand" | "success" | "warning" | "danger";
}) {
  return (
    <span
      data-kit="Chip"
      data-tone={tone}
      className={
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-[3px] " +
        `text-[length:var(--text-2xs)] font-medium leading-none ${CHIP_TONE[tone]} ${className}`
      }
      {...props}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Label */

/** Names a region without competing with what is inside it. */
export function Label({ className = "", children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span data-kit="Label" className={`label ${className}`} {...props}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className = "",
  inset = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      data-kit="Card"
      className={
        "rounded-[var(--radius)] border border-[hsl(var(--rule))] " +
        `${inset ? "bg-[hsl(var(--surface-sunken))]" : "bg-[hsl(var(--surface))]"} ${className}`
      }
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

/**
 * The unit the workspace is built from: a titled region with a hairline head.
 * The title bar is the same height everywhere so panels align across columns.
 */
export function Panel({
  title,
  meta,
  actions,
  footer,
  bodyClassName = "",
  className = "",
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-kit="Panel"
      className={
        "flex min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border " +
        `border-[hsl(var(--rule))] bg-[hsl(var(--surface))] ${className}`
      }
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--rule))] px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="label truncate">{title}</span>
          {meta ? <span className="truncate text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">{meta}</span> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName || "p-4"}`}>{children}</div>
      {footer ? (
        <footer className="shrink-0 border-t border-[hsl(var(--rule))] px-3 py-2">{footer}</footer>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      data-kit="Skeleton"
      aria-hidden="true"
      className={`animate-pulse rounded-[var(--radius-sm)] bg-[hsl(var(--rule-faint))] ${className || "h-3 w-32"}`}
    />
  );
}

/* ------------------------------------------------------------- VerdictChip */

const VERDICT: Record<string, { bg: string; dot: string; note: string }> = {
  Stable: {
    bg: "bg-[hsl(var(--stable-soft))] text-[hsl(var(--stable))]",
    dot: "bg-[hsl(var(--stable))]",
    note: "No other reading moves this number materially",
  },
  Sensitive: {
    bg: "bg-[hsl(var(--sensitive-soft))] text-[hsl(var(--sensitive))]",
    dot: "bg-[hsl(var(--sensitive))]",
    note: "Another reasonable reading moves this number",
  },
  Fragile: {
    bg: "bg-[hsl(var(--fragile-soft))] text-[hsl(var(--fragile))]",
    dot: "bg-[hsl(var(--fragile))]",
    note: "The answer depends heavily on which reading you meant",
  },
};

export function VerdictChip({
  status,
  withNote = false,
}: {
  status: "Stable" | "Sensitive" | "Fragile";
  withNote?: boolean;
}) {
  const style = VERDICT[status];
  return (
    <span
      data-kit="VerdictChip"
      data-status={status}
      title={style.note}
      className={
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-[3px] " +
        `text-[length:var(--text-2xs)] font-semibold uppercase tracking-[var(--tracking-label)] ${style.bg}`
      }
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
      {withNote ? (
        <span className="ml-1 font-normal normal-case tracking-normal opacity-80">{style.note}</span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------- Field, Rule */

/** A labelled key/value line. The workhorse of the truth panel and drawers. */
export function Field({
  label,
  value,
  mono = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div data-kit="Field" className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[length:var(--text-xs)] text-[hsl(var(--ink-3))]">{label}</span>
      <span
        {...(mono ? { "data-numeric": "" } : {})}
        className="min-w-0 truncate text-right text-[length:var(--text-sm)] text-[hsl(var(--ink))]"
      >
        {value}
      </span>
    </div>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-[hsl(var(--rule))] ${className}`} />;
}
