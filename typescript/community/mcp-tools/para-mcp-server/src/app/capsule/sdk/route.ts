import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const upstream = "https://app.beta.usecapsule.com/sdk.js";

  const res = await fetch(upstream, {
    // Avoid Next caching upstream unexpectedly; let browser cache via headers below
    cache: "no-store",
  });

  const body = await res.arrayBuffer();

  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
