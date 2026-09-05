/**
 * The entities and data bounds the workspace header needs.
 *
 * The query service catalog also carries every account, which is megabytes on a
 * real ledger and none of the browser's business, so only the parts the header
 * renders are passed through.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.QUERY_SERVICE_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${base}/catalog`, {
      cache: "no-store",
      signal: AbortSignal.timeout(Number(process.env.QUERY_SERVICE_TIMEOUT_MS || 20000)),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ detail: "catalog unavailable" }), { status: response.status });
    }
    const catalog = await response.json();
    return new Response(JSON.stringify({
      entities: catalog.entities ?? [],
      data_bounds: catalog.data_bounds ?? null,
      account_count: (catalog.accounts ?? []).length,
    }), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ detail: "query service unavailable" }), { status: 503 });
  }
}
