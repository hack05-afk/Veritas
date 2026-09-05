"use client";

import React from "react";

const BASE = "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium " +
  "transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:pointer-events-none";

const VARIANT: Record<string, string> = {
  primary: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--foreground))] active:opacity-90",
  secondary: "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--brand-soft))]",
  ghost: "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--brand-soft))]",
};

export function Button({ variant = "primary", className = "", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      data-kit="Button"
      data-variant={variant}
      className={`${BASE} ${VARIANT[variant]} min-h-[44px] px-4 text-sm ${className}`}
      {...props}
    />
  );
}

export function Chip({ tone = "neutral", className = "", children, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "success" | "warning" | "danger" }) {
  const tones: Record<string, string> = {
    neutral: "bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]",
    brand: "bg-[hsl(var(--brand-soft))] text-[hsl(var(--brand-text))] border-transparent",
    success: "bg-[hsl(var(--success-soft))] text-[hsl(var(--success-text))] border-transparent",
    warning: "bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning-text))] border-transparent",
    danger: "bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger-text))] border-transparent",
  };
  return (
    <span data-kit="Chip" data-tone={tone}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${tones[tone]} ${className}`}
      {...props}>{children}</span>
  );
}

export function Card({ tilt = false, className = "", children, ...props }:
  React.HTMLAttributes<HTMLDivElement> & { tilt?: boolean }) {
  return (
    <div data-kit="Card" data-tilt={tilt ? "true" : "false"}
      className={`rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 ${
        tilt ? "transition-transform duration-[var(--motion-base)] hover:-translate-y-0.5" : ""} ${className}`}
      {...props}>{children}</div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div data-kit="Skeleton" aria-hidden="true"
    className={`animate-pulse rounded-[var(--radius)] bg-[hsl(var(--border))] ${className || "h-4 w-40"}`} />;
}

const VERDICT_TONE = { Stable: "success", Sensitive: "warning", Fragile: "danger" } as const;

export function VerdictChip({ status }: { status: "Stable" | "Sensitive" | "Fragile" }) {
  const tone = VERDICT_TONE[status];
  const tones: Record<string, string> = {
    success: "bg-[hsl(var(--success-soft))] text-[hsl(var(--success-text))]",
    warning: "bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning-text))]",
    danger: "bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger-text))]",
  };
  return (
    <span data-kit="VerdictChip" data-status={status}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {status}
    </span>
  );
}
