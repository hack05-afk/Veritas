/**
 * Replays a recorded event stream.
 *
 * The interface can be built and demonstrated without a model or a database:
 * /workspace?replay=spend_last_month plays fixtures/events/spend_last_month.jsonl,
 * and &slow=1 slows it to one event a second so each stage can be watched.
 */
import fs from "fs";

import { repoFile } from "@/lib/paths";

export const dynamic = "force-dynamic";

const SAFE_NAME = /^[a-z0-9_]+$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  const slow = url.searchParams.get("slow") === "1";

  if (!SAFE_NAME.test(name)) {
    return new Response(JSON.stringify({ detail: "unknown stream" }), { status: 404 });
  }
  const file = repoFile(`fixtures/events/${name}.jsonl`);
  if (!file) {
    return new Response(JSON.stringify({ detail: "unknown stream" }), { status: 404 });
  }

  const events = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.trim());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        if (slow) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
