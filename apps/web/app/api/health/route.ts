import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness for the web app, and with ?deep=1 for the query service behind it.
 * The deep form is what the demo runner asks before it claims to be live.
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("deep") !== "1") {
    return NextResponse.json({ ok: true, service: "web" });
  }

  const base = (process.env.QUERY_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return NextResponse.json({ ok: response.ok, service: "web", query_service: response.ok });
  } catch {
    return NextResponse.json({ ok: false, service: "web", query_service: false });
  }
}
