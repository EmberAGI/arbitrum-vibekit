import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearClientCache, getOnchainActionsClient } from './clientFactory.js';

const { onchainActionsCtorMock } = vi.hoisted(() => ({
  onchainActionsCtorMock: vi.fn(),
}));

vi.mock('../clients/onchainActions.js', () => ({
  OnchainActionsClient: onchainActionsCtorMock,
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(),
}));

describe('clientFactory', () => {
  afterEach(() => {
    clearClientCache();
    onchainActionsCtorMock.mockReset();
  });

  it('creates and caches the onchain actions client', () => {
    const first = getOnchainActionsClient();
    const second = getOnchainActionsClient();

    expect(first).toBe(second);
    expect(onchainActionsCtorMock).toHaveBeenCalledTimes(1);
    expect(onchainActionsCtorMock).toHaveBeenCalledWith('https://api.emberai.xyz');
  });
});
