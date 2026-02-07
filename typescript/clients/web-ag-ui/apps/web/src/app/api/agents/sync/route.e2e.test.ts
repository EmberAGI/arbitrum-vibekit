import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

describe('POST /api/agents/sync (e2e)', () => {
  it('syncs against a running agent runtime without stubbing fetch', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');

    const response = await fetch(`${webBaseUrl}/api/agents/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-gmx-allora',
        threadId: crypto.randomUUID(),
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as unknown;

    expect(payload).toEqual(
      expect.objectContaining({
        agentId: 'agent-gmx-allora',
      }),
    );
  });
});

