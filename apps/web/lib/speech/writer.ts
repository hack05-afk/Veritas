/**
 * The English Speech Writer.
 *
 * Spoken answers carry no digits and no symbols: a number read aloud as
 * "1240000" is unusable, so every amount becomes Indian words before it is
 * ever spoken or translated.
 */
import type { VerifiedResultPackage } from "../orchestrator/types";
import { redactText } from "../security/redact";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Words for a number below one hundred, with no hyphens. */
function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/** Words for a number below one thousand. */
function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return underHundred(rest);
  const head = `${ONES[hundreds]} hundred`;
  return rest ? `${head} and ${underHundred(rest)}` : head;
}

/** Words for a whole number using crore, lakh and thousand. */
function wholeToWords(n: number): string {
  if (n === 0) return "zero";
  const groups: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) groups.push(`${wholeToWords(crore)} crore`);
  if (lakh) groups.push(`${underHundred(lakh)} lakh`);
  if (thousand) groups.push(`${underHundred(thousand)} thousand`);
  if (rest) {
    // "and" joins a bare remainder to the groups before it, as in one thousand and five.
    const tail = underThousand(rest);
    groups.push(rest < 100 && groups.length ? `and ${tail}` : tail);
  }
  return groups.join(" ");
}

/** An amount in rupees, spoken the way it is spoken in India. */
export function toIndianWords(amount: number): string {
  const negative = amount < 0;
  const value = Math.abs(Math.round(amount * 100) / 100);
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let text = `${wholeToWords(rupees)} ${rupees === 1 ? "rupee" : "rupees"}`;
  if (paise) text += ` and ${underHundred(paise)} ${paise === 1 ? "paisa" : "paise"}`;
  return negative ? `minus ${text}` : text;
}

/** Two or three plain sentences, safe to translate and speak. */
export function writeSpeech(pkg: VerifiedResultPackage): string {
  const sentences: string[] = [];

  if (pkg.refusal) {
    sentences.push("I cannot answer that from this data without guessing");
    sentences.push("You can ask about spend, receipts, counterparties, balances or a reference number");
  } else if (pkg.clarification) {
    sentences.push("I need one detail before I can answer");
    sentences.push(pkg.clarification.question.replace(/[0-9₹%*_#|`-]/g, "").trim());
  } else {
    const value = pkg.answer_value ?? 0;
    const words = pkg.answer_unit === "count"
      ? `${wholeToWords(Math.round(value))} ${Math.round(value) === 1 ? "transaction" : "transactions"}`
      : toIndianWords(value);
    sentences.push(`The total is ${words}`);
    if (pkg.verdict?.status !== "Stable") {
      sentences.push("Read another way that number moves, so take it with the alternatives beside it");
    }
  }

  sentences.push("The breakdown is on your screen");
  // A spoken sentence is sent to a translation and speech service, so it goes
  // out through the same filter as every other exit.
  return redactText(`${sentences.join(". ")}.`);
}
