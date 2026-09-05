/**
 * Sarvam speech services: speech to text, translation and text to speech.
 *
 * Sarvam is used for speech only. The text model that reads a question and
 * writes a plan is a separate provider, because every chat model on this
 * endpoint is larger than the twenty billion parameter limit.
 *
 * The real calls here have not been exercised against a live key yet. Set
 * SARVAM_API_KEY and leave SARVAM_PROVIDER unset to use them; everything else
 * runs on the fixtures.
 */
import fs from "fs";

import { requireRepoFile } from "../paths";

const BASE = process.env.SARVAM_BASE_URL || "https://api.sarvam.ai";

/** Speech calls carry audio, so they are given a longer budget than a text call. */
function timeout(): AbortSignal {
  return AbortSignal.timeout(Number(process.env.SARVAM_TIMEOUT_MS || 30000));
}

/** Anything that cannot be spoken plainly: digits, symbols and dashes. */
export const UNSPEAKABLE = /[0-9₹%*_#|\-–—]/;

export interface Transcript { text_en: string; detected_lang: string; transcript_native: string }

export function fakeTranscripts(): Record<string, Transcript & { keyword: string }> {
  return JSON.parse(fs.readFileSync(requireRepoFile("fixtures/voice/fake_transcripts.json"), "utf8"));
}

export function speakers(): Record<string, string> {
  return JSON.parse(fs.readFileSync(requireRepoFile("fixtures/voice/speakers.json"), "utf8"));
}

/**
 * Is this request meant to use the fixtures rather than the live service?
 *
 * Outside production a caller may ask for the fixtures with a header, which is
 * how the test suite runs against a deployment that has a key. The header can
 * only ever force the fixtures: nothing a client sends can turn on a paid call.
 */
export function useFake(request: Request): boolean {
  const configured = (process.env.SARVAM_PROVIDER || "fake") === "fake";
  if (configured) return true;
  if (process.env.NODE_ENV === "production") return false;

  // x-veritas-provider is the canonical name. x-tbx-provider is the earlier
  // name and is still read so older clients keep working.
  const header = request.headers.get("x-veritas-provider") ?? request.headers.get("x-tbx-provider");
  return header === "fake";
}

function key(): string {
  const value = process.env.SARVAM_API_KEY;
  if (!value) throw new Error("SARVAM_API_KEY is not set");
  return value;
}

/** One second of silence, so the fake path still returns playable audio. */
export function silentWav(seconds = 1, rate = 16000): string {
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer.toString("base64");
}

/** Saaras in translate mode: speech in any supported language, English text out. */
export async function speechToTextTranslate(audio: Blob, filename: string): Promise<Transcript> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.SARVAM_STT_MODEL || "saaras:v2.5");

  const response = await fetch(`${BASE}/speech-to-text-translate`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`speech to text failed: ${response.status} ${await response.text()}`);

  const body = await response.json();
  return {
    text_en: body.transcript ?? "",
    detected_lang: body.language_code ?? "en-IN",
    transcript_native: body.diarized_transcript ?? body.transcript ?? "",
  };
}

export async function translate(text: string, target: string): Promise<string> {
  if (target === "en-IN") return text;
  const response = await fetch(`${BASE}/translate`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": key() },
    body: JSON.stringify({ input: text, source_language_code: "en-IN", target_language_code: target }),
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`translate failed: ${response.status} ${await response.text()}`);
  return (await response.json()).translated_text ?? text;
}

export async function textToSpeech(text: string, target: string): Promise<string> {
  const speaker = speakers()[target] ?? speakers()["en-IN"];
  const response = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": key() },
    body: JSON.stringify({
      text,
      target_language_code: target,
      speaker,
      model: process.env.SARVAM_TTS_MODEL || "bulbul:v2",
    }),
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`text to speech failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return Array.isArray(body.audios) ? body.audios[0] : body.audio ?? "";
}
