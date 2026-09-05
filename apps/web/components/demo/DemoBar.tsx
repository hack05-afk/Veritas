"use client";

/**
 * The presenter's bar.
 *
 * Where we are in the script, what the beat proves, and where the answer on
 * screen came from. The mode is stated rather than implied, so nothing shown
 * from a recorded stream can be presented as a live result.
 */
import React from "react";
import { Button, Chip } from "@veritas/ui";

import { AUTO_SECONDS_CHOICES, DEMO_BEATS } from "@/lib/demo/script";
import type { DemoController } from "@/lib/demo/useDemo";

/** The six beats as a rule, in the same language as the stage rail. */
function Progress({ index, running }: { index: number; running: boolean }) {
  return (
    <ol aria-hidden="true" className="flex min-w-[7rem] flex-1 items-center gap-1.5">
      {DEMO_BEATS.map((beat, position) => {
        const tone = position < index
          ? "bg-ink"
          : position > index
            ? "bg-rule"
            : running
              ? "marching"
              : "bg-accent";
        return <li key={beat.id} className={`h-px min-w-3 flex-1 ${tone}`} />;
      })}
    </ol>
  );
}

function ModeChip({ controller }: { controller: DemoController }) {
  if (controller.mode === null) return <Chip tone="quiet">Checking</Chip>;
  return controller.mode === "live"
    ? <Chip tone="brand">Live</Chip>
    : <Chip tone="neutral">Replay</Chip>;
}

export function DemoBar({ controller }: { controller: DemoController }) {
  const { beat, index, total, running, started, paused, source } = controller;

  const startLabel = !started ? "Start" : paused ? "Resume" : "Pause";
  const onStartOrPause = () => {
    if (!started || paused) controller.start();
    else controller.pause();
  };

  return (
    <div
      data-demo-bar
      data-demo-mode={controller.mode ?? "checking"}
      className="flex h-11 shrink-0 items-center gap-4 border-b border-rule bg-surface px-4"
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span data-demo-beat={index + 1} data-numeric className="shrink-0 text-2xs text-ink-3">
          {index + 1} of {total}
        </span>
        <span className="truncate text-sm text-ink">{beat.note}</span>
        <span className="hidden shrink-0 truncate text-2xs text-ink-4 xl:inline">
          {beat.requirement}
        </span>
      </div>

      <Progress index={index} running={running} />

      <div className="flex shrink-0 items-center gap-1.5">
        {controller.fellBack ? (
          <span data-demo-fallback title={controller.reason ?? undefined}>
            <Chip tone="warning">replayed from fixture</Chip>
          </span>
        ) : null}
        {source === "missing" ? (
          <span data-demo-fallback title={controller.reason ?? undefined}>
            <Chip tone="warning">no recorded stream for this beat</Chip>
          </span>
        ) : null}
        <ModeChip controller={controller} />

        <label className="flex items-center gap-1.5 pl-1 text-2xs text-ink-3">
          <input
            type="checkbox"
            checked={controller.auto}
            onChange={(event) => controller.setAuto(event.target.checked)}
            className="h-3 w-3 accent-[hsl(var(--accent))]"
          />
          Auto
        </label>
        <label className="sr-only" htmlFor="demo-seconds">Seconds between beats</label>
        <select
          id="demo-seconds"
          value={controller.autoSeconds}
          onChange={(event) => controller.setAutoSeconds(Number(event.target.value))}
          className="h-7 rounded-sm border border-rule bg-surface px-1.5 text-2xs text-ink-2 outline-none hover:border-rule-strong focus:border-accent"
        >
          {AUTO_SECONDS_CHOICES.map((seconds) => (
            <option key={seconds} value={seconds}>{seconds}s</option>
          ))}
        </select>

        <Button size="sm" onClick={onStartOrPause}>{startLabel}</Button>
        <Button size="sm" variant="secondary" onClick={controller.previous} disabled={index <= 0}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" onClick={controller.next} disabled={index >= total - 1}>
          Next
        </Button>
        <Button size="sm" variant="ghost" onClick={controller.restart}>Restart</Button>
        <Button size="sm" variant="ghost" onClick={controller.exit}>Exit demo</Button>
      </div>
    </div>
  );
}
