"use client";

/**
 * A dashboard panel.
 *
 * Panels stack down the right of the workspace. Any one of them can be pushed
 * out to fill the screen when it needs the room, and collapsed to its header
 * when it does not, so the working and the answer can share one column without
 * either being cramped.
 */
import React from "react";

export function Panel({ title, subtitle, badge, defaultOpen = true, children }: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [expanded, setExpanded] = React.useState(false);

  const body = (
    <div className={expanded ? "max-h-[75vh] overflow-y-auto" : ""}>
      {children}
    </div>
  );

  const card = (
    <section data-panel data-expanded={expanded ? "true" : "false"}
      className={`rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] ${
        expanded ? "w-full max-w-5xl shadow-2xl" : ""}`}>
      <header className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 text-base font-medium">
            {title}
            {badge}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setExpanded((value) => !value)}
            className="rounded-[var(--radius)] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--brand-soft))] hover:text-[hsl(var(--brand-text))]">
            {expanded ? "Shrink" : "Expand"}
          </button>
          {!expanded ? (
            <button type="button" onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="rounded-[var(--radius)] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--brand-soft))] hover:text-[hsl(var(--brand-text))]">
              {open ? "Collapse" : "Open"}
            </button>
          ) : null}
        </div>
      </header>
      {open || expanded ? <div className="px-5 py-4">{body}</div> : null}
    </section>
  );

  if (!expanded) return card;

  return (
    <>
      <section className="rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] px-5 py-4 text-sm text-[hsl(var(--muted-foreground))]">
        {title} is expanded
      </section>
      <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[hsl(var(--foreground))]/30 p-6 backdrop-blur-sm">
        {card}
      </div>
    </>
  );
}
