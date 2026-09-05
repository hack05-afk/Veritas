/**
 * Conversation memory.
 *
 * Held in the process, keyed by conversation_id, so a follow-up like "compare
 * that with the month before" knows what "that" was. It is deliberately not a
 * database: this is a single-user self-hosted build.
 */
import type { QueryPlan, VerifiedResultPackage } from "./types";

export interface Turn {
  plan: QueryPlan | null;
  pkg: VerifiedResultPackage | null;
  turn: number;
}

// Survives the module reloads a dev server does between requests.
const store: Map<string, Turn> = ((globalThis as any).__veritasState ??= new Map());

export function get(conversationId: string): Turn {
  return store.get(conversationId) ?? { plan: null, pkg: null, turn: 0 };
}

export function nextTurn(conversationId: string): number {
  const current = get(conversationId);
  const turn = current.turn + 1;
  store.set(conversationId, { ...current, turn });
  return turn;
}

export function remember(conversationId: string, plan: QueryPlan | null, pkg: VerifiedResultPackage | null): void {
  const current = get(conversationId);
  store.set(conversationId, { plan: plan ?? current.plan, pkg: pkg ?? current.pkg, turn: current.turn });
}
