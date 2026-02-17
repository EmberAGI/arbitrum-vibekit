import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearClientCache, getOnchainActionsClient, getOnchainClients } from './clientFactory.js';

const { createClientsMock, onchainActionsCtorMock, privateKeyToAccountMock } = vi.hoisted(() => ({
  createClientsMock: vi.fn(),
  onchainActionsCtorMock: vi.fn(),
  privateKeyToAccountMock: vi.fn(),
}));

vi.mock('../clients/onchainActions.js', () => ({
  OnchainActionsClient: onchainActionsCtorMock,
}));

vi.mock('../clients/clients.js', () => ({
  createClients: createClientsMock,
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: privateKeyToAccountMock,
}));

describe('clientFactory', () => {
  afterEach(() => {
    clearClientCache();
    onchainActionsCtorMock.mockReset();
    createClientsMock.mockReset();
    privateKeyToAccountMock.mockReset();
    delete process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  });

  it('creates and caches the onchain actions client', () => {
    const first = getOnchainActionsClient();
    const second = getOnchainActionsClient();

    expect(first).toBe(second);
    expect(onchainActionsCtorMock).toHaveBeenCalledTimes(1);
    expect(onchainActionsCtorMock).toHaveBeenCalledWith('https://api.emberai.xyz');
  });

  it('creates and caches the onchain clients from the embedded private key', () => {
    process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY =
      '0x0000000000000000000000000000000000000000000000000000000000000001';

    privateKeyToAccountMock.mockReturnValue({ address: '0xabc' });
    createClientsMock.mockReturnValue({ kind: 'clients' });

    const first = getOnchainClients();
    const second = getOnchainClients();

    expect(first).toBe(second);
    expect(privateKeyToAccountMock).toHaveBeenCalledTimes(1);
    expect(createClientsMock).toHaveBeenCalledTimes(1);
  });

  it('throws when embedded private key is missing', () => {
    delete process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;

    expect(() => getOnchainClients()).toThrow(/A2A_TEST_AGENT_NODE_PRIVATE_KEY/);
  });
});
