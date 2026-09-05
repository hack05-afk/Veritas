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
export function Waveform({ amplitude = 0.3, bars = 48, className = "" }:
  { amplitude?: number; bars?: number; className?: string }) {
  const heights = React.useMemo(
    () => Array.from({ length: bars }, (_, i) => {
      const shape = Math.sin((i / bars) * Math.PI);
      const grain = 0.75 + 0.25 * Math.sin(i * 2.399);
      return Math.max(0.04, Math.min(1, shape * grain * (0.3 + amplitude)));
    }),
    [amplitude, bars],
  );
  return (
    <div data-kit="Waveform" data-amplitude={amplitude} aria-hidden="true"
      className={`flex h-16 items-center justify-center gap-[2px] ${className}`}>
      {heights.map((height, index) => (
        <span key={index}
          className="w-[2px] bg-[hsl(var(--accent))] transition-[height] duration-[var(--motion-fast)]"
          style={{ height: `${Math.round(height * 100)}%`, opacity: 0.4 + height * 0.6 }} />
      ))}
    </div>
  );
}

/**
 * The page backdrop: an engineering grid, not a decoration. Two scales of rule
 * so the eye reads a coordinate system rather than graph paper.
 */
export function GridBackground({ className = "", fade = true }: { className?: string; fade?: boolean }) {
  const mask = "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 78%)";
  return (
    <div data-kit="GridBackground" aria-hidden="true"
      className={`h-full w-full ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(hsl(var(--rule-faint)) 1px, transparent 1px)," +
          "linear-gradient(90deg, hsl(var(--rule-faint)) 1px, transparent 1px)," +
          "linear-gradient(hsl(var(--rule)) 1px, transparent 1px)," +
          "linear-gradient(90deg, hsl(var(--rule)) 1px, transparent 1px)",
        backgroundSize: "24px 24px, 24px 24px, 120px 120px, 120px 120px",
        ...(fade ? { maskImage: mask, WebkitMaskImage: mask } : {}),
      }} />
  );
}

/**
 * Light and dark. Stored per browser, applied as data-theme on the root so the
 * token file does the rest. Wrapped in try/catch because storage throws in
 * private windows and in preview capture.
 */
export function useTheme(): [string, (next: string) => void] {
  const [theme, setThemeState] = React.useState("light");

  React.useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("veritas-theme"); } catch { saved = null; }
    const initial = saved
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setThemeState(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const setTheme = React.useCallback((next: string) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try { window.localStorage.setItem("veritas-theme", next); } catch { /* storage unavailable */ }
  }, []);

  return [theme, setTheme];
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <button type="button" data-kit="ThemeToggle" aria-label="Switch between light and dark"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={`inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-[hsl(var(--rule))] px-2 text-[length:var(--text-2xs)] font-medium uppercase tracking-[var(--tracking-label)] text-[hsl(var(--ink-3))] hover:text-[hsl(var(--ink))] ${className}`}>
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
