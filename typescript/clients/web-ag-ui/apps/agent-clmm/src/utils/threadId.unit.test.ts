import { afterEach, describe, expect, it } from 'vitest';

import { buildStableThreadId, resolveThreadId } from './threadId.js';

const ORIGINAL_THREAD_ID = process.env['CLMM_THREAD_ID'];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  if (ORIGINAL_THREAD_ID === undefined) {
    delete process.env['CLMM_THREAD_ID'];
  } else {
    process.env['CLMM_THREAD_ID'] = ORIGINAL_THREAD_ID;
  }
});

describe('threadId helpers', () => {
  it('buildStableThreadId is deterministic per agent + wallet', () => {
    // Given a mixed-case wallet address and agent id
    const agentId = 'agent-clmm';
    const walletUpper = '0xAaBbCcDdEeFf00112233445566778899AaBbCcDd';
    const walletLower = walletUpper.toLowerCase();

    // When building stable ids for the same identity
    const fromUpper = buildStableThreadId(agentId, walletUpper);
    const fromLower = buildStableThreadId(agentId, walletLower);
    const fromDifferentAgent = buildStableThreadId('agent-other', walletLower);

    // Then it should normalize casing and stay stable for the same identity
    expect(fromUpper).toBe(fromLower);
    expect(fromDifferentAgent).not.toBe(fromUpper);
  });

  it('resolveThreadId prefers explicit CLMM_THREAD_ID', () => {
    // Given an explicit env override and an invalid wallet
    process.env['CLMM_THREAD_ID'] = 'thread-from-env';

    // When resolving the thread id
    const resolved = resolveThreadId({
      sourceLabel: 'test',
      walletAddress: 'not-a-wallet',
    });

    // Then the explicit value should be returned
    expect(resolved).toBe('thread-from-env');
  });

  it('resolveThreadId returns a stable id when wallet is provided', () => {
    // Given a wallet address and agent id
    delete process.env['CLMM_THREAD_ID'];
    const agentId = 'agent-clmm';
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

    // When resolving the thread id
    const resolved = resolveThreadId({
      sourceLabel: 'test',
      agentId,
      walletAddress,
    });

    // Then it should match the stable id generator
    expect(resolved).toBe(buildStableThreadId(agentId, walletAddress));
  });

  it('resolveThreadId generates a UUID when no wallet is provided', () => {
    // Given no wallet and no explicit thread id
    delete process.env['CLMM_THREAD_ID'];

    // When resolving the thread id
    const resolved = resolveThreadId({ sourceLabel: 'test' });

    // Then a UUID-like value should be returned
    expect(UUID_REGEX.test(resolved)).toBe(true);
  });
});
