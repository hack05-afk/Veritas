"use client";

/**
 * Call Veritas.
 *
 * Speak a question in an Indian language, hear the answer in the same
 * language, and watch the evidence appear while it is spoken. An upload path
 * sits beside the microphone so the call works without one.
 */
import React from "react";
import { Button, Typewriter, Waveform } from "@veritas/ui";

import { TruthPanel } from "@/components/truth/TruthPanel";
import type { EvidenceRecord } from "@/components/evidence/EvidenceDrawer";
import { writeSpeech } from "@/lib/speech/writer";
import type { VerifiedResultPackage } from "@/lib/orchestrator/types";

const LANGUAGE: Record<string, string> = {
  "en-IN": "English", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu",
  "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "gu-IN": "Gujarati",
  "bn-IN": "Bengali", "pa-IN": "Punjabi", "od-IN": "Odia",
};

const CHUNK_MS = 3000;

export function CallSurface({ open, fakeProvider, pkg, sql, records, filters, onAsk, onEnd }: {
  open: boolean;
  fakeProvider: boolean;
  pkg: VerifiedResultPackage | null;
  sql?: string;
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
  onAsk: (question: string) => void;
  onEnd: () => void;
}) {
  const [language, setLanguage] = React.useState<string | null>(null);
  const [transcript, setTranscript] = React.useState("");
  const [amplitude, setAmplitude] = React.useState(0.2);
  const [listening, setListening] = React.useState(false);
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Upload a clip or start speaking.");
  const spokenFor = React.useRef<string | null>(null);

  const providerHeader = React.useCallback(
    () => (fakeProvider ? { "x-tbx-provider": "fake" } : {}),
    [fakeProvider],
  );

  const send = React.useCallback(async (blob: Blob, filename: string) => {
    setStatus("Listening to that.");
    const form = new FormData();
    form.append("audio", blob, filename);
    form.append("hint_lang", "auto");
    const response = await fetch("/api/voice/transcribe", {
      method: "POST", body: form, headers: providerHeader() as HeadersInit,
    });
    if (!response.ok) { setStatus("That clip could not be transcribed."); return; }
    const body = await response.json();
    setLanguage(body.detected_lang);
    setTranscript(body.transcript_native || body.text_en);
    setStatus("Working out the answer.");
    onAsk(body.text_en);
  }, [onAsk, providerHeader]);

  // Speak the answer once, as soon as it is complete.
  React.useEffect(() => {
    if (!open || !pkg || pkg.answer_value === null) return;
    if (spokenFor.current === pkg.question) return;
    spokenFor.current = pkg.question;

    (async () => {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json", ...providerHeader() },
        body: JSON.stringify({ text_en: writeSpeech(pkg), target_lang: language ?? "en-IN" }),
      });
      if (!response.ok) { setStatus("The answer is on screen."); return; }
      const body = await response.json();
      setAudioSrc(`data:audio/wav;base64,${body.audio_base64}`);
      setStatus("Answered.");
    })();
  }, [open, pkg, language, providerHeader]);

  // Microphone capture, in short chunks, when the browser allows it.
  React.useEffect(() => {
    if (!open || !listening) return;
    let stop = () => {};
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const meter = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          const peak = data.reduce((worst, value) => Math.max(worst, Math.abs(value - 128)), 0);
          setAmplitude(Math.min(1, peak / 90));
        }, 100);

        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = () => { void send(new Blob(chunks, { type: "audio/webm" }), "capture.webm"); };
        recorder.start();
        const timer = window.setTimeout(() => recorder.stop(), CHUNK_MS);

        stop = () => {
          window.clearInterval(meter);
          window.clearTimeout(timer);
          if (recorder.state !== "inactive") recorder.stop();
          stream.getTracks().forEach((track) => track.stop());
          void context.close();
        };
      } catch {
        setStatus("No microphone here. Upload a clip instead.");
        setListening(false);
      }
    })();
    return () => stop();
  }, [open, listening, send]);

  if (!open) return null;

  return (
    <div data-call-surface
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[hsl(var(--background))] p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">Veritas</span>
          <span data-language-chip
            className="rounded-full bg-[hsl(var(--brand-soft))] px-3 py-1 text-xs text-[hsl(var(--brand-text))]">
            {language ? LANGUAGE[language] ?? language : "Listening for a language"}
          </span>
        </div>
        <Button variant="secondary" onClick={onEnd}>End call</Button>
      </header>

      <section className="mt-8 flex flex-col items-center gap-4">
        <Waveform amplitude={amplitude} bars={40} />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{status}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant={listening ? "secondary" : "primary"} onClick={() => setListening((on) => !on)}>
            {listening ? "Stop speaking" : "Start speaking"}
          </Button>
          <label className="text-sm text-[hsl(var(--muted-foreground))]">
            <span className="mr-2">or upload a clip</span>
            <input type="file" accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void send(file, file.name);
              }} />
          </label>
        </div>
        <audio controls src={audioSrc ?? undefined} className="mt-2 w-full max-w-md" />
      </section>

      <p data-live-transcript className="mt-6 min-h-6 text-center text-lg">
        {transcript ? <Typewriter text={transcript} /> : null}
      </p>

      <div className="mx-auto mt-6 w-full max-w-3xl">
        {pkg && pkg.answer_value !== null ? (
          <TruthPanel pkg={pkg} sql={sql} records={records} filters={filters} />
        ) : null}
      </div>
    </div>
  );
}
