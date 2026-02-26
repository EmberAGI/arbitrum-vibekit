import { afterEach, describe, expect, it } from 'vitest';

import { getAgentThreadId, resolveAgentThreadWalletAddress } from './agentThread';

const ORIGINAL_DELEGATIONS_BYPASS = process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS;
const ORIGINAL_WALLET_BYPASS_ADDRESS = process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS;

afterEach(() => {
  if (ORIGINAL_DELEGATIONS_BYPASS === undefined) {
    delete process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS;
  } else {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = ORIGINAL_DELEGATIONS_BYPASS;
  }

  if (ORIGINAL_WALLET_BYPASS_ADDRESS === undefined) {
    delete process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS;
  } else {
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = ORIGINAL_WALLET_BYPASS_ADDRESS;
  }
});

describe('agentThread wallet resolution', () => {
  it('prefers connected privy wallet address', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'true';
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = '0x3333333333333333333333333333333333333333';

    expect(
      resolveAgentThreadWalletAddress('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    ).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('uses bypass wallet address when delegations bypass is enabled', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'true';
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = '0x1111111111111111111111111111111111111111';

    expect(resolveAgentThreadWalletAddress(undefined)).toBe(
      '0x1111111111111111111111111111111111111111',
    );
  });

  it('uses default bypass wallet address when delegations bypass is enabled without an explicit address', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'true';
    delete process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS;

    expect(resolveAgentThreadWalletAddress(undefined)).toBe(
      '0x0000000000000000000000000000000000000000',
    );
  });

  it('returns null when bypass is enabled but bypass address is invalid', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'true';
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = 'invalid';

    expect(resolveAgentThreadWalletAddress(undefined)).toBeNull();
  });

  it('returns null without privy wallet when bypass mode is disabled', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'false';
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = '0x2222222222222222222222222222222222222222';

    expect(resolveAgentThreadWalletAddress(undefined)).toBeNull();
    expect(getAgentThreadId('agent-gmx-allora', undefined)).toBeNull();
  });

  it('generates a deterministic thread id from bypass wallet identity', () => {
    process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS = 'true';
    process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS = '0x4444444444444444444444444444444444444444';

    const first = getAgentThreadId('agent-gmx-allora', undefined);
    const second = getAgentThreadId('agent-gmx-allora', undefined);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });
});
