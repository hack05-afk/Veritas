/** Passes the Ledger Pulse through from the query service, so the browser needs no second origin. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const entity = new URL(request.url).searchParams.get("entity_id");
  const base = process.env.QUERY_SERVICE_URL || "http://localhost:8000";
  const target = `${base}/pulse${entity ? `?entity_id=${encodeURIComponent(entity)}` : ""}`;

  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(Number(process.env.QUERY_SERVICE_TIMEOUT_MS || 20000)),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ detail: "query service unavailable" }), { status: 503 });
  }
}
