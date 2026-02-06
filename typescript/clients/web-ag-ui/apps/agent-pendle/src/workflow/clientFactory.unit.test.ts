import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';

const { createClientsMock } = vi.hoisted(() => ({
  createClientsMock: vi.fn(),
}));

const { onchainActionsCtorMock } = vi.hoisted(() => ({
  onchainActionsCtorMock: vi.fn(),
}));

vi.mock('../clients/clients.js', () => ({
  createClients: createClientsMock,
}));

vi.mock('../clients/onchainActions.js', () => ({
  OnchainActionsClient: onchainActionsCtorMock,
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(),
}));

describe('clientFactory', () => {
  afterEach(() => {
    delete process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
    delete process.env.ONCHAIN_ACTIONS_API_URL;
    vi.resetModules();
    createClientsMock.mockReset();
    onchainActionsCtorMock.mockReset();
  });

  it('creates and caches the onchain actions client', async () => {
    delete process.env.ONCHAIN_ACTIONS_API_URL;

    const { getOnchainActionsClient } = await import('./clientFactory.js');
    const first = getOnchainActionsClient();
    const second = getOnchainActionsClient();

    expect(first).toBe(second);
    expect(onchainActionsCtorMock).toHaveBeenCalledTimes(1);
    expect(onchainActionsCtorMock).toHaveBeenCalledWith('https://api.emberai.xyz');
  });

  it('creates and caches onchain clients using the agent private key', async () => {
    process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const { getOnchainClients } = await import('./clientFactory.js');
    const { privateKeyToAccount } = await import('viem/accounts');

    const account = { address: '0x0000000000000000000000000000000000000001' };
    vi.mocked(privateKeyToAccount).mockReturnValue(account);

    const clients: OnchainClients = { publicClient: {} } as OnchainClients;
    createClientsMock.mockReturnValue(clients);

    const first = getOnchainClients();
    const second = getOnchainClients();

    expect(first).toBe(second);
    expect(privateKeyToAccount).toHaveBeenCalledWith(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(createClientsMock).toHaveBeenCalledWith(account);
  });
});
