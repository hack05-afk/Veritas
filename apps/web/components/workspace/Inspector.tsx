"use client";

/**
 * The inspector rail.
 *
 * Three ways of pressing on the answer beside it, and the lineage of whichever
 * figure was last clicked. Everything shown is derived from the package the
 * query service returned; when a surface has no real data behind it the rail
 * says so rather than drawing an empty control.
 *
 * The regions are flush and share their hairlines, so the rail reads as one
 * column of an instrument rather than as a stack of cards.
 */
import React from "react";
import {
  AdversarialAudit,
  ProvenanceTrail,
  TimeScrub,
  WhatIf,
  type Provenance,
} from "@veritas/ui";

import { rewindow, strongestCounter, toAttacks, toAxes, toBuckets } from "@/components/truth/derive";
import type { QueryPlan, VerifiedResultPackage } from "@/lib/orchestrator/types";

/** A rail region. The 40px head is the same height as the system Panel's. */
function Region({ title, meta, action, children }: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-rule bg-surface last:border-b-0">
      <header className="flex h-10 items-center justify-between gap-3 border-b border-rule px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="label truncate">{title}</span>
          {meta ? <span className="truncate text-2xs text-ink-3">{meta}</span> : null}
        </div>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>;
}

export function Inspector({
  pkg,
  plan,
  trail,
  onCloseTrail,
  onAsk,
}: {
  pkg: VerifiedResultPackage | null;
  plan?: QueryPlan;
  /** Set when a figure was clicked in the truth panel. */
  trail: Provenance | null;
  onCloseTrail: () => void;
  onAsk: (question: string) => void;
}) {
  const axes = React.useMemo(() => (pkg ? toAxes(pkg, plan) : []), [pkg, plan]);
  const attacks = React.useMemo(() => (pkg ? toAttacks(pkg) : []), [pkg]);
  const strongest = React.useMemo(() => (pkg ? strongestCounter(pkg) : null), [pkg]);
  const buckets = React.useMemo(() => (pkg ? toBuckets(pkg, plan) : null), [pkg, plan]);

  return (
    <aside
      data-inspector
      className="flex min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t border-rule bg-surface min-[1600px]:w-[340px] min-[1600px]:border-l min-[1600px]:border-t-0"
    >
      <Region
        title="Where this number came from"
        meta={trail ? undefined : "click any figure"}
        action={
          trail ? (
            <button type="button" onClick={onCloseTrail} className="shrink-0 text-2xs text-accent hover:underline">
              Clear
            </button>
          ) : null
        }
      >
        {trail ? (
          <ProvenanceTrail provenance={trail} />
        ) : (
          <Empty>
            Every figure in the answer is clickable. Clicking one traces it back to the template,
            the window and the rows it was computed from.
          </Empty>
        )}
      </Region>

      <Region title="What if it were read differently">
        {pkg ? (
          <WhatIf
            primary={pkg.answer_value ?? 0}
            axes={axes}
            materialityPct={pkg.verdict.thresholds.stable}
            onRecompute={(axis, reading) => onAsk(`${pkg.question} read with ${axis} as ${reading}`)}
          />
        ) : (
          <Empty>The readings that would change the answer appear here once one is computed.</Empty>
        )}
      </Region>

      <Region title="What was tried against it" meta={pkg ? `${attacks.length} attempts` : undefined}>
        {pkg ? (
          <AdversarialAudit attacks={attacks} strongest={strongest} />
        ) : (
          <Empty>After an answer is computed the system tries to break it, and reports here.</Empty>
        )}
      </Region>

      {pkg && buckets ? (
        <Region title="The window" meta="narrowing it asks the question again">
          <TimeScrub
            buckets={buckets}
            window={buckets.map((bucket) => bucket.key)}
            onCommit={(from, to) => onAsk(rewindow(pkg.question, from, to))}
          />
        </Region>
      ) : null}
    </aside>
  );
}
