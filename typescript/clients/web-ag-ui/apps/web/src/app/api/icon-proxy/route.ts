import { NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  // Coingecko CDN used by our icon resolvers.
  'coin-images.coingecko.com',
  // Allow as a backstop; some upstream payloads still reference this domain.
  'assets.coingecko.com',
  // Some token metadata uses GitHub-hosted SVGs.
  'raw.githubusercontent.com',
]);

function parseUpstreamUrl(requestUrl: string): URL | null {
  const url = new URL(requestUrl);
  const raw = url.searchParams.get('url');
  if (!raw) return null;

  let upstream: URL;
  try {
    upstream = new URL(raw);
  } catch {
    return null;
  }

  if (upstream.protocol !== 'https:' && upstream.protocol !== 'http:') return null;
  if (!ALLOWED_HOSTS.has(upstream.hostname)) return null;

  return upstream;
}

export async function GET(request: Request) {
  const upstream = parseUpstreamUrl(request.url);
  if (!upstream) {
    return NextResponse.json(
      { error: 'Invalid url' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const response = await fetch(upstream.toString(), {
    headers: {
      // Some CDNs are picky about empty/unknown UAs.
      'User-Agent': 'forge-web-ag-ui (icon proxy)',
    },
    // Cache the proxy response for a day; icons don't need to be real-time.
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Upstream error (${response.status})` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

