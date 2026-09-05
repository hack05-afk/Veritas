/**
 * English text in, speech in the caller's language out.
 *
 * The text must already be words: a spoken answer that reads out digits or
 * symbols is unusable, and the Speech Writer has converted them by this point.
 */
import { NextResponse } from "next/server";

import { silentWav, textToSpeech, translate, UNSPEAKABLE, useFake } from "@/lib/voice/sarvam";

export const dynamic = "force-dynamic";

// Synthesis outruns the default limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = body?.text_en;
  const target = body?.target_lang ?? "en-IN";

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ detail: "text_en is required" }, { status: 400 });
  }
  if (UNSPEAKABLE.test(text)) {
    return NextResponse.json(
      { detail: "text_en must be words only: no digits, currency symbols or dashes" },
      { status: 400 },
    );
  }

  if (useFake(request)) {
    return NextResponse.json({ text_native: text, audio_base64: silentWav(), format: "wav" });
  }

  try {
    const native = await translate(text, target);
    return NextResponse.json({
      text_native: native,
      audio_base64: await textToSpeech(native, target),
      format: "wav",
    });
  } catch (error) {
    return NextResponse.json({ detail: String((error as Error).message ?? error) }, { status: 502 });
  }
}
