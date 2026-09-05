"use client";

import React from "react";
import { formatIndian } from "../format";

/** True when the visitor asked for less movement. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

export function Typewriter({ text, charsPerMs = 28, className = "" }:
  { text: string; charsPerMs?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(text);

  React.useEffect(() => {
    if (reduced) { setShown(text); return; }
    setShown("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, charsPerMs);
    return () => window.clearInterval(timer);
  }, [text, charsPerMs, reduced]);

  return <span data-kit="Typewriter" className={className}>{shown}</span>;
}

export function CountUp({ value, decimals = false, prefix = "₹", durationMs = 500, className = "" }:
  { value: number; decimals?: boolean; prefix?: string; durationMs?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(reduced ? value : 0);

  React.useEffect(() => {
    if (reduced) { setShown(value); return; }
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return <span data-kit="CountUp" data-numeric className={className}>{prefix}{formatIndian(shown, decimals)}</span>;
}

/** A live level meter drawn as bars, so it needs no canvas. */
export function Waveform({ amplitude = 0.3, bars = 28, className = "" }:
  { amplitude?: number; bars?: number; className?: string }) {
  const heights = React.useMemo(
    () => Array.from({ length: bars }, (_, i) => {
      const shape = Math.sin((i / bars) * Math.PI);
      return Math.max(0.08, Math.min(1, shape * (0.35 + amplitude)));
    }),
    [amplitude, bars],
  );
  return (
    <div data-kit="Waveform" data-amplitude={amplitude} aria-hidden="true"
      className={`flex h-12 items-center gap-[3px] ${className}`}>
      {heights.map((height, index) => (
        <span key={index}
          className="w-[3px] rounded-full bg-[hsl(var(--brand))] transition-[height] duration-[var(--motion-fast)]"
          style={{ height: `${Math.round(height * 100)}%` }} />
      ))}
    </div>
  );
}

/** The still stand-in for the ledger field, and the page's own backdrop. */
export function GridBackground({ className = "" }: { className?: string }) {
  return (
    <div data-kit="GridBackground" aria-hidden="true"
      className={`h-full w-full ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
      }} />
  );
}
