import { NextResponse } from 'next/server';
import { DEFAULT_SERVER_URLS } from '../../../../agents-config';

export async function GET() {
  try {
    // Resolve MCP server base URL from agents-config, fallback to env or localhost
    const mcpUrl =
      DEFAULT_SERVER_URLS.get('para') || process.env.PARA_MCP_URL || 'http://localhost:3012/mcp';

    let target: URL;
    try {
      const base = new URL(mcpUrl);
      target = new URL('/api/pregen-wallets', `${base.protocol}//${base.host}`);
    } catch {
      target = new URL('http://localhost:3012/api/pregen-wallets');
    }

    const upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
      },
    });

    const result = await upstreamResp.json().catch(() => ({ ok: false, message: 'Invalid JSON from server' }));
    return NextResponse.json(result, { status: upstreamResp.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'ServerError', message: err?.message || String(err) },
      { status: 500 },
    );
  }
}
