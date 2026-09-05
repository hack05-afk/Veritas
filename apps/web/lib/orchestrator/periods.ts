/**
 * Turning "last month" into dates.
 *
 * Every period is resolved against the latest transaction date in the data, not
 * against today, so the same question gives the same answer next week.
 */

export interface Bounds { min_date: string; max_date: string }
export interface Period { kind: "calendar" | "trailing"; start: string; end: string; label: string }

const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const monthEnd = (y: number, m: number) => utc(y, m + 1, 0);

function label(start: Date, end: Date): string {
  const wholeMonth = start.getUTCDate() === 1
    && start.getUTCFullYear() === end.getUTCFullYear()
    && start.getUTCMonth() === end.getUTCMonth()
    && end.getTime() === monthEnd(end.getUTCFullYear(), end.getUTCMonth()).getTime();
  if (wholeMonth) {
    const name = MONTHS[start.getUTCMonth()];
    return `${name[0].toUpperCase()}${name.slice(1)} ${start.getUTCFullYear()}`;
  }
  return `${iso(start)} to ${iso(end)}`;
}

function calendarMonth(year: number, month: number): Period {
  const start = utc(year, month, 1);
  const end = monthEnd(year, month);
  return { kind: "calendar", start: iso(start), end: iso(end), label: label(start, end) };
}

/**
 * Resolve a phrase to a period, or null when it names a time the data does not cover.
 * `previous` is the period of the last answered question, for "the month before".
 */
export function resolvePeriod(text: string, bounds: Bounds,
                              previous?: { start: string; end: string } | null): Period | null {
  const phrase = (text || "").toLowerCase();
  const max = parse(bounds.max_date);
  const min = parse(bounds.min_date);

  const days = phrase.match(/(\d+)\s*days?/);
  if (days) {
    const length = parseInt(days[1], 10);
    const start = new Date(max.getTime() - (length - 1) * 86400000);
    return { kind: "trailing", start: iso(start), end: iso(max), label: `trailing ${length} days` };
  }

  if (/(month|period)\s+before|previous month|prior month/.test(phrase)) {
    const anchor = previous ? parse(previous.start) : utc(max.getUTCFullYear(), max.getUTCMonth(), 1);
    return calendarMonth(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1);
  }

  if (/last month|past month|this month/.test(phrase)) {
    return calendarMonth(max.getUTCFullYear(), max.getUTCMonth());
  }

  if (/quarter/.test(phrase)) {
    const start = utc(max.getUTCFullYear(), Math.floor(max.getUTCMonth() / 3) * 3, 1);
    return { kind: "calendar", start: iso(start), end: iso(max),
             label: `Q${Math.floor(max.getUTCMonth() / 3) + 1} ${max.getUTCFullYear()}` };
  }

  const year = phrase.match(/\b(19|20)\d{2}\b/);
  const named = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(phrase));
  if (named >= 0) {
    const wanted = year ? parseInt(year[0], 10) : max.getUTCMonth() >= named
      ? max.getUTCFullYear() : max.getUTCFullYear() - 1;
    const period = calendarMonth(wanted, named);
    return parse(period.end) < min || parse(period.start) > max ? null : period;
  }

  if (year) {
    const wanted = parseInt(year[0], 10);
    const start = utc(wanted, 0, 1);
    const end = utc(wanted, 11, 31);
    if (end < min || start > max) return null;
    return { kind: "calendar", start: iso(start), end: iso(end), label: `${wanted}` };
  }

  return null;
}
