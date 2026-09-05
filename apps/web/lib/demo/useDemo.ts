"use client";

/**
 * The demo runner.
 *
 * It holds the position in the script and decides, per beat, whether what the
 * room is looking at came from the live pipeline or from a recorded stream. It
 * runs nothing itself: the workspace hands it the same two functions a typed
 * question uses, so a demo shows the product rather than a picture of it.
 */
import React from "react";

import {
  BEAT_TIMEOUT_MS,
  DEFAULT_AUTO_SECONDS,
  DEMO_BEATS,
  PROBE_TIMEOUT_MS,
  type DemoBeat,
  type DemoMode,
} from "./script";

/** Where the beat on screen actually came from. */
export type BeatSource = "live" | "replay" | "missing";

export interface RunOutcome {
  ok: boolean;
  reason?: string;
}

export interface DemoController {
  active: boolean;
  index: number;
  beat: DemoBeat;
  total: number;
  /** Null until the probe has answered. */
  mode: DemoMode | null;
  source: BeatSource | null;
  /** True when the session is live but this beat had to be replayed. */
  fellBack: boolean;
  reason: string | null;
  started: boolean;
  running: boolean;
  paused: boolean;
  auto: boolean;
  autoSeconds: number;
  setAuto: (on: boolean) => void;
  setAutoSeconds: (seconds: number) => void;
  start: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  restart: () => void;
  exit: () => void;
}

interface Wiring {
  /** True when ?demo= asked for the demo. */
  requested: boolean;
  forced: DemoMode | null;
  /** Runs the question through the real pipeline. */
  askLive: (question: string, signal: AbortSignal) => Promise<RunOutcome>;
  /**
   * Plays a recorded stream. `echo` is false when a live attempt has already
   * put the question in the conversation and only the answer is being replaced.
   */
  replayBeat: (
    fixture: string, question: string, echo: boolean, signal: AbortSignal,
  ) => Promise<RunOutcome>;
  /** Empties the answer surfaces, so a beat that cannot run shows nothing stale. */
  clearAnswer: () => void;
  /** Extra work once an answer has settled. */
  afterAnswer: (after: DemoBeat["after"]) => void;
  /** Clears ?demo= so the workspace is itself again. */
  onExit: () => void;
}

/** Asks the web app, and through it the query service, whether live will work. */
async function probe(): Promise<DemoMode> {
  try {
    const response = await fetch("/api/health?deep=1", {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return "replay";
    const body = await response.json();
    return body?.ok === true && body?.query_service === true ? "live" : "replay";
  } catch {
    return "replay";
  }
}

export function useDemo(wiring: Wiring): DemoController {
  const { requested, forced, askLive, replayBeat, clearAnswer, afterAnswer, onExit } = wiring;

  const [active, setActive] = React.useState(requested);
  const [mode, setMode] = React.useState<DemoMode | null>(forced);
  const [index, setIndex] = React.useState(0);
  const [source, setSource] = React.useState<BeatSource | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [started, setStarted] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [auto, setAuto] = React.useState(false);
  const [autoSeconds, setAutoSeconds] = React.useState(DEFAULT_AUTO_SECONDS);

  // Bumped whenever a run is abandoned, so a late result cannot claim the bar.
  const token = React.useRef(0);
  const aborter = React.useRef<AbortController | null>(null);
  const modeRef = React.useRef<DemoMode | null>(forced);
  modeRef.current = mode;

  /** Abandons whatever is in flight: a later result can no longer land. */
  const abandon = React.useCallback(() => {
    token.current += 1;
    aborter.current?.abort();
    aborter.current = null;
  }, []);

  React.useEffect(() => {
    if (!active || forced) return;
    let cancelled = false;
    void probe().then((decided) => {
      if (!cancelled) setMode(decided);
    });
    return () => { cancelled = true; };
  }, [active, forced]);

  const play = React.useCallback(async (position: number) => {
    const beat = DEMO_BEATS[position];
    if (!beat) return;
    abandon();
    const mine = token.current;
    const controller = new AbortController();
    aborter.current = controller;

    setIndex(position);
    setStarted(true);
    setPaused(false);
    setRunning(true);
    setSource(null);
    setReason(null);

    // Starting before the probe has answered waits for it rather than assuming.
    let decided = modeRef.current;
    if (decided === null) {
      decided = await probe();
      if (mine !== token.current) return;
      modeRef.current = decided;
      setMode(decided);
    }

    const live = decided === "live";
    let played: BeatSource = "replay";
    let why: string | null = null;

    if (live) {
      // The beat has a deadline: a slow provider must not hold up the room.
      const deadline = window.setTimeout(() => controller.abort(), BEAT_TIMEOUT_MS);
      const outcome = await askLive(beat.question, controller.signal);
      window.clearTimeout(deadline);
      if (mine !== token.current) return;
      if (outcome.ok) played = "live";
      else why = outcome.reason ?? "the live run did not finish in time";
    }

    if (played !== "live") {
      if (!beat.fixture) {
        played = "missing";
      } else {
        // The live attempt may have aborted this controller, so the replay
        // needs a fresh one.
        const replayController = new AbortController();
        aborter.current = replayController;
        const replayed = await replayBeat(
          beat.fixture, beat.question, !live, replayController.signal,
        );
        if (mine !== token.current) return;
        if (!replayed.ok) {
          played = "missing";
          why = replayed.reason ?? "the recorded stream could not be played";
        }
      }
    }

    aborter.current = null;
    if (played === "missing") clearAnswer();
    setSource(played);
    setReason(why);
    setRunning(false);
    if (played !== "missing" && beat.after) afterAnswer(beat.after);
  }, [abandon, askLive, replayBeat, clearAnswer, afterAnswer]);

  const start = React.useCallback(() => {
    if (started && paused) { void play(index); return; }
    if (started) return;
    void play(0);
  }, [started, paused, index, play]);

  const pause = React.useCallback(() => {
    abandon();
    setRunning(false);
    setPaused(true);
    setAuto(false);
  }, [abandon]);

  const next = React.useCallback(() => {
    if (!started) { void play(0); return; }
    if (index >= DEMO_BEATS.length - 1) return;
    void play(index + 1);
  }, [started, index, play]);

  const previous = React.useCallback(() => {
    if (index <= 0) return;
    void play(index - 1);
  }, [index, play]);

  const restart = React.useCallback(() => { void play(0); }, [play]);

  const exit = React.useCallback(() => {
    abandon();
    setActive(false);
    setAuto(false);
    setRunning(false);
    onExit();
  }, [abandon, onExit]);

  // A presenter holds a clicker, so the keys matter more than the buttons.
  React.useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "Escape") {
        event.preventDefault();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, previous, exit]);

  // Auto-advance waits for the answer, then for the presenter's chosen pause.
  React.useEffect(() => {
    if (!active || !auto || !started || running || paused) return;
    if (index >= DEMO_BEATS.length - 1) return;
    const timer = window.setTimeout(() => { void play(index + 1); }, autoSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [active, auto, started, running, paused, index, autoSeconds, play]);

  return {
    active,
    index,
    beat: DEMO_BEATS[index],
    total: DEMO_BEATS.length,
    mode,
    source,
    fellBack: mode === "live" && source === "replay",
    reason,
    started,
    running,
    paused,
    auto,
    autoSeconds,
    setAuto,
    setAutoSeconds,
    start,
    pause,
    next,
    previous,
    restart,
    exit,
  };
}
