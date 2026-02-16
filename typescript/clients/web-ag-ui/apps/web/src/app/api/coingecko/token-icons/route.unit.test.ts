import { describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('/api/coingecko/token-icons', () => {
  it('returns an icon for an exact symbol match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain('api.coingecko.com/api/v3/search');

        return new Response(
          JSON.stringify({
            coins: [
              { id: 'ethereum', name: 'Ethereum', symbol: 'eth', large: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png' },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const request = new Request('http://localhost/api/coingecko/token-icons?symbols=ETH');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { icons: Record<string, string>; missing: string[] };
    expect(payload.icons.ETH).toContain('coingecko.com');
    expect(payload.missing).toEqual([]);
  });
});

