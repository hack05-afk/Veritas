/** Speech in any supported language, English text out. The key stays on the server. */
import { NextResponse } from "next/server";

import { fakeTranscripts, speechToTextTranslate, useFake } from "@/lib/voice/sarvam";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ detail: "expected multipart form data with an audio field" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ detail: "audio is required" }, { status: 400 });
  }
  const filename = (audio as File).name || "clip.wav";

  if (useFake(request)) {
    const fixture = fakeTranscripts()[filename];
    if (!fixture) {
      return NextResponse.json({ detail: `no fixture transcript for ${filename}` }, { status: 404 });
    }
    return NextResponse.json({
      text_en: fixture.text_en,
      detected_lang: fixture.detected_lang,
      transcript_native: fixture.transcript_native,
    });
  }

  try {
    return NextResponse.json(await speechToTextTranslate(audio, filename));
  } catch (error) {
    return NextResponse.json({ detail: String((error as Error).message ?? error) }, { status: 502 });
  }
}
