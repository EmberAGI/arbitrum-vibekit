import { NextResponse } from 'next/server';
import { DEFAULT_SERVER_URLS } from '../../../../../agents-config';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const identifierKey = searchParams.get('identifierKey');
    const identifierValue = searchParams.get('identifierValue');
    const address = searchParams.get('address');

    if (!address && (!identifierKey || !identifierValue)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ValidationError',
          message: 'Provide either address or both identifierKey and identifierValue',
        },
        { status: 400 },
      );
    }

    // Resolve MCP server base URL from agents-config, fallback to env or localhost
    const mcpUrl =
      DEFAULT_SERVER_URLS.get('para') || process.env.PARA_MCP_URL || 'http://localhost:3012/mcp';

    let target: URL;
    try {
      const base = new URL(mcpUrl);
      target = new URL('/api/pregen-wallet/by-identifier', `${base.protocol}//${base.host}`);
    } catch {
      target = new URL('http://localhost:3012/api/pregen-wallet/by-identifier');
    }
    if (address) {
      target.searchParams.set('address', address);
    }
    if (identifierKey) target.searchParams.set('identifierKey', identifierKey);
    if (identifierValue) target.searchParams.set('identifierValue', identifierValue);

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
