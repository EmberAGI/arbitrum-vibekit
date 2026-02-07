import type { Account } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import { createClients, createRpcTransport } from './clients.js';

const { createPublicClientMock, createWalletClientMock, httpMock } = vi.hoisted(() => ({
  createPublicClientMock: vi.fn<[], { kind: string }>(),
  createWalletClientMock: vi.fn<[], { kind: string }>(),
  httpMock: vi.fn(),
}));

vi.mock('viem', () => ({
  createPublicClient: createPublicClientMock,
  createWalletClient: createWalletClientMock,
  http: httpMock,
}));

vi.mock('viem/chains', () => ({
  arbitrum: { id: 42161 },
}));

describe('createRpcTransport', () => {
  it('wraps function transports with retry and timeout defaults', () => {
    const baseTransport = vi.fn().mockReturnValue('ok');
    httpMock.mockReturnValue(baseTransport);

    const transport = createRpcTransport('https://example.com');

    transport({ method: 'eth_chainId' });
    expect(baseTransport).toHaveBeenCalledWith({
      method: 'eth_chainId',
      retryCount: 2,
      timeout: 8000,
    });
  });

  it('returns non-function transports as-is', () => {
    const transportObject = { request: vi.fn() };
    httpMock.mockReturnValue(transportObject);

    const transport = createRpcTransport('https://example.com');

    expect(transport).toBe(transportObject);
  });
});

describe('createClients', () => {
  it('creates public and wallet clients with shared transport', () => {
    const baseTransport = vi.fn().mockReturnValue('ok');
    httpMock.mockReturnValue(baseTransport);
    createPublicClientMock.mockReturnValue({ kind: 'public' });
    createWalletClientMock.mockReturnValue({ kind: 'wallet' });

    const account = { address: '0x0000000000000000000000000000000000000001' } as Account;
    const clients = createClients(account);

    const publicArgs = createPublicClientMock.mock.calls[0]?.[0];
    const walletArgs = createWalletClientMock.mock.calls[0]?.[0];

    expect(publicArgs?.chain).toEqual({ id: 42161 });
    expect(typeof publicArgs?.transport).toBe('function');
    expect(walletArgs?.account).toBe(account);
    expect(walletArgs?.chain).toEqual({ id: 42161 });
    expect(typeof walletArgs?.transport).toBe('function');
    expect(clients.public).toEqual({ kind: 'public' });
    expect(clients.wallet).toEqual({ kind: 'wallet' });
  });
});
