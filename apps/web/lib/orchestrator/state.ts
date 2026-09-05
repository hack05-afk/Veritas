/**
 * Conversation memory.
 *
 * Held in the process, keyed by conversation_id, so a follow-up like "compare
 * that with the month before" knows what "that" was. It is deliberately not a
 * database: this is a single-user self-hosted build.
 *
 * Entries expire, for two reasons. A map that only ever grows is a leak in a
 * long-lived server, and a conversation resumed hours later is not the same
 * conversation: carrying "that" across the gap would answer a new question with
 * an old plan.
 */
import type { QueryPlan, VerifiedResultPackage } from "./types";

export interface Turn {
  plan: QueryPlan | null;
  pkg: VerifiedResultPackage | null;
  turn: number;
  at: number;
}

/** How long a conversation stays resumable, in milliseconds. */
export const TTL_MS = Number(process.env.CONVERSATION_TTL_MS || 30 * 60 * 1000);

const EMPTY: Turn = { plan: null, pkg: null, turn: 0, at: 0 };

// Survives the module reloads a dev server does between requests.
const store: Map<string, Turn> = ((globalThis as any).__veritasState ??= new Map());

/** Drop everything that has gone past its time to live. */
function sweep(now: number): void {
  for (const [id, turn] of store) {
    if (now - turn.at > TTL_MS) store.delete(id);
  }
}

export function get(conversationId: string): Turn {
  const found = store.get(conversationId);
  if (!found) return EMPTY;
  if (Date.now() - found.at > TTL_MS) {
    store.delete(conversationId);
    return EMPTY;
  }
  return found;
}

export function nextTurn(conversationId: string): number {
  const now = Date.now();
  sweep(now);
  const current = get(conversationId);
  const turn = current.turn + 1;
  store.set(conversationId, { ...current, turn, at: now });
  return turn;
}

export function remember(conversationId: string, plan: QueryPlan | null, pkg: VerifiedResultPackage | null): void {
  const current = get(conversationId);
  store.set(conversationId, {
    plan: plan ?? current.plan,
    pkg: pkg ?? current.pkg,
    turn: current.turn,
    at: Date.now(),
  });
}
