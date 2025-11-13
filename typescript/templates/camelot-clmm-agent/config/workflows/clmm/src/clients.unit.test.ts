import { afterEach, describe, expect, it, vi } from 'vitest';

const httpMock = vi.fn((url: string) => ({ type: 'http', url }));
const createPublicClientMock = vi.fn((config: unknown) => ({ kind: 'public', config }));
const createBundlerClientMock = vi.fn((config: unknown) => ({ kind: 'bundler', config }));
const createPaymasterClientMock = vi.fn((config: unknown) => ({ kind: 'paymaster', config }));
const createPimlicoClientMock = vi.fn((config: unknown) => ({ kind: 'pimlico', config }));

const partial = <T extends Record<string, unknown>>(value: T): unknown =>
  expect.objectContaining(value) as unknown;

vi.mock('viem', () => ({
  createPublicClient: createPublicClientMock,
  http: httpMock,
}));

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: createBundlerClientMock,
  createPaymasterClient: createPaymasterClientMock,
}));

vi.mock('viem/chains', () => ({
  arbitrum: { id: 42161, name: 'arbitrum-one' },
}));

vi.mock('permissionless/clients/pimlico', () => ({
  createPimlicoClient: createPimlicoClientMock,
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

  it('wires custom RPC endpoints for public/bundler/paymaster/pimlico clients', async () => {
    // Given operator-provided RPC URLs for Arbitrum and Pimlico
    process.env['ARBITRUM_RPC_URL'] = 'https://arb.custom.rpc';
    process.env['PIMLICO_ARBITRUM_URL'] = 'https://pimlico.custom.rpc';
    vi.resetModules();
    const { createClients } = await import('./clients.js');

    // When the helper constructs the client bundle
    const clients = createClients();

    // Then each viem client should receive the mocked arbitrum chain plus the matching transports
    expect(createPublicClientMock).toHaveBeenCalledWith({
      chain: partial({ id: 42161 }),
      transport: partial({ url: 'https://arb.custom.rpc' }),
    });
    expect(httpMock).toHaveBeenCalledWith('https://arb.custom.rpc');

    expect(createBundlerClientMock).toHaveBeenCalledWith({
      chain: partial({ id: 42161 }),
      transport: partial({ url: 'https://pimlico.custom.rpc' }),
    });
    expect(createPaymasterClientMock).toHaveBeenCalledWith({
      transport: partial({ url: 'https://pimlico.custom.rpc' }),
    });
    expect(createPimlicoClientMock).toHaveBeenCalledWith({
      chain: partial({ id: 42161 }),
      transport: partial({ url: 'https://pimlico.custom.rpc' }),
    });

    // And the returned structure should expose each mocked client for downstream callers
    expect(clients.public).toEqual(partial({ kind: 'public' }));
    expect(clients.bundler).toEqual(partial({ kind: 'bundler' }));
    expect(clients.paymaster).toEqual(partial({ kind: 'paymaster' }));
    expect(clients.pimlico).toEqual(partial({ kind: 'pimlico' }));
  });
});
