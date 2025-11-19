import { afterEach, describe, expect, it, vi } from 'vitest';

const httpMock = vi.fn((url: string) => ({ type: 'http', url }));
const createPublicClientMock = vi.fn((config: unknown) => ({ kind: 'public', config }));
const createWalletClientMock = vi.fn((config: unknown) => ({ kind: 'wallet', config }));

const partial = <T extends Record<string, unknown>>(value: T): unknown =>
  expect.objectContaining(value) as unknown;

vi.mock('viem', () => ({
  createPublicClient: createPublicClientMock,
  createWalletClient: createWalletClientMock,
  http: httpMock,
}));

vi.mock('viem/chains', () => ({
  arbitrum: { id: 42161, name: 'arbitrum-one' },
}));

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('createClients', () => {
  afterEach(() => {
    vi.clearAllMocks();
    restoreEnv();
    vi.resetModules();
  });

  it('wires the RPC endpoint for both public and wallet clients', async () => {
    // Given operator-provided RPC URLs for Arbitrum
    process.env['ARBITRUM_RPC_URL'] = 'https://arb.custom.rpc';
    vi.resetModules();
    const { createClients } = await import('./clients.js');

    // When the helper constructs the client bundle
    const clients = createClients({ address: '0xabc' } as `0x${string}`);

    // Then each viem client should receive the mocked arbitrum chain plus the matching transports
    expect(createPublicClientMock).toHaveBeenCalledWith({
      chain: partial({ id: 42161 }),
      transport: partial({ url: 'https://arb.custom.rpc' }),
    });
    expect(createWalletClientMock).toHaveBeenCalledWith({
      account: partial({ address: '0xabc' }),
      chain: partial({ id: 42161 }),
      transport: partial({ url: 'https://arb.custom.rpc' }),
    });
    expect(httpMock).toHaveBeenCalledWith('https://arb.custom.rpc');

    // And the returned structure should expose each mocked client for downstream callers
    expect(clients.public).toEqual(partial({ kind: 'public' }));
    expect(clients.wallet).toEqual(partial({ kind: 'wallet' }));
  });
});
