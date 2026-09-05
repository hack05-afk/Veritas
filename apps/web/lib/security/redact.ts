/**
 * The one place the web app decides what a sensitive value looks like.
 *
 * Two shapes matter: a long run of digits, which is an account number, and a
 * long run of mixed letters and digits with no separator, which is a UTR. Both
 * are recognised by shape rather than by field name, because the point of this
 * module is to catch the field nobody remembered to mask.
 *
 * Everything that leaves the product passes through here: the prompts sent to
 * the language model, the CSV export, the PDF report and the spoken sentence.
 * It is the layer behind the per-field masking, not a replacement for it.
 */

// Eleven digits is the shortest account number this dataset produces. A shorter
// run is a transaction reference, which the product shows on purpose.
const LONG_DIGITS = /\d{11,}/g;

// A UTR: twelve to twenty-four characters, letters and digits, no separator.
const UTR_SHAPE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{12,24}\b/g;

/** Keys that must never carry a value out, whatever is in them. */
const DROP_KEYS = new Set(["account_number", "utr_number", "account_no", "utr"]);
const DROP_SUFFIXES = ["_plain", "_raw"];

/**
 * Values the product generates for itself rather than reads from the ledger: an
 * evidence handle and the parameterised SQL. An evidence ref is twelve hex
 * characters, which is the same shape as a UTR, so masking it would break
 * pagination. Neither can carry an identifier, because the SQL binds its values
 * and the ref is a hash.
 */
const STRUCTURAL_KEYS = new Set(["ref", "evidence_ref", "sql"]);

function isDropped(key: string): boolean {
  const lowered = key.toLowerCase();
  return DROP_KEYS.has(lowered) || DROP_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

function keepLastFour(match: string): string {
  return `${"*".repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`;
}

/** One string with every account number and UTR reduced to its last four characters. */
export function redactText(text: string): string {
  return text.replace(LONG_DIGITS, keepLastFour).replace(UTR_SHAPE, keepLastFour);
}

/** Whether a string carries anything shaped like an account number or a UTR. */
export function hasSensitive(text: string): boolean {
  return new RegExp(LONG_DIGITS.source).test(text) || new RegExp(UTR_SHAPE.source).test(text);
}

/**
 * A deep copy with every sensitive key dropped and every sensitive string
 * masked. Numbers are left alone, so no computed figure can move.
 */
export function redact<T>(value: T, exempt = false): T {
  if (typeof value === "string") return (exempt ? value : redactText(value)) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redact(item, exempt)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isDropped(key)) continue;
      out[key] = redact(child, STRUCTURAL_KEYS.has(key.toLowerCase()));
    }
    return out as unknown as T;
  }
  return value;
}

/** How many values a payload would lose to redact, for a test or a log line. */
export function countRedactions(value: unknown, exempt = false): number {
  if (typeof value === "string") {
    if (exempt) return 0;
    return (value.match(LONG_DIGITS)?.length ?? 0) + (value.match(UTR_SHAPE)?.length ?? 0);
  }
  if (Array.isArray(value)) {
    return value.reduce((n: number, item) => n + countRedactions(item, exempt), 0);
  }
  if (value && typeof value === "object") {
    let total = 0;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      total += isDropped(key) ? 1 : countRedactions(child, STRUCTURAL_KEYS.has(key.toLowerCase()));
    }
    return total;
  }
  return 0;
}

/** Throw if anything here would have been redacted. Used by the tests. */
export function assertClean(value: unknown): void {
  const found = countRedactions(value);
  if (found) throw new Error(`${found} sensitive value(s) in payload`);
}

const PLACEHOLDER = /IDENTIFIER_(\d+)/g;

export interface Sanitised<T> {
  /** The payload with every identifier replaced by a placeholder. */
  safe: T;
  /** Put the real identifiers back into whatever the model answered. */
  restore: <R>(answer: R) => R;
  /** How many distinct identifiers were held back. */
  held: number;
}

/**
 * Prepare anything that is about to become a prompt.
 *
 * An account number or a UTR is replaced by a placeholder rather than masked,
 * because the model does not need the value but the plan it writes does: a
 * question like "show the transaction with UTR ..." has to keep working. The
 * model reasons about IDENTIFIER_1 and the real value is put back into the plan
 * it returns, so the identifier never reaches the model and the lookup still
 * runs. Masking it instead would send a broken value into the query.
 */
export function sanitiseForModel<T>(payload: T): Sanitised<T> {
  const byValue = new Map<string, string>();

  const swap = (text: string): string =>
    text.replace(LONG_DIGITS, hold).replace(UTR_SHAPE, hold);

  function hold(match: string): string {
    let placeholder = byValue.get(match);
    if (!placeholder) {
      placeholder = `IDENTIFIER_${byValue.size + 1}`;
      byValue.set(match, placeholder);
    }
    return placeholder;
  }

  function walk(value: unknown, exempt: boolean): unknown {
    if (typeof value === "string") return exempt ? value : swap(value);
    if (Array.isArray(value)) return value.map((item) => walk(item, exempt));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (isDropped(key)) continue;
        out[key] = walk(child, STRUCTURAL_KEYS.has(key.toLowerCase()));
      }
      return out;
    }
    return value;
  }

  const safe = walk(payload, false) as T;

  const back = new Map<string, string>();
  for (const [original, placeholder] of byValue) back.set(placeholder, original);

  function put(value: unknown): unknown {
    if (typeof value === "string") {
      return value.replace(PLACEHOLDER, (match) => back.get(match) ?? match);
    }
    if (Array.isArray(value)) return value.map(put);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = put(child);
      }
      return out;
    }
    return value;
  }

  return { safe, restore: <R,>(answer: R) => put(answer) as R, held: byValue.size };
}
