import { describe, expect, it, vi } from 'vitest';

import {
  ALLORA_TOPIC_LABELS,
  ALLORA_TOPIC_WHITELIST,
  resolveAgentWalletAddress,
  resolveDelegationsBypass,
  resolveE2EProfile,
  resolveGmxAlloraMode,
  resolveGmxAlloraTxExecutionMode,
  resolveOnchainActionsApiUrl,
  resolvePollIntervalMs,
} from './constants.js';

describe('config/constants', () => {
  it('normalizes the OpenAPI endpoint to a base URL and logs the change', () => {
    process.env.ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz/openapi.json';

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsApiUrl({ logger });

    expect(baseUrl).toBe('https://api.emberai.xyz');
    expect(logger).toHaveBeenCalledWith(
      'Normalized onchain-actions endpoint from OpenAPI spec URL',
      expect.objectContaining({
        endpoint: 'https://api.emberai.xyz/openapi.json',
        baseUrl: 'https://api.emberai.xyz',
        source: 'ONCHAIN_ACTIONS_API_URL',
      }),
    );
  });

  it('returns the trimmed base URL for explicit overrides and logs the override', () => {
    process.env.ONCHAIN_ACTIONS_API_URL = 'https://api.example.test/';

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsApiUrl({ logger });

    expect(baseUrl).toBe('https://api.example.test');
    expect(logger).toHaveBeenCalledWith(
      'Using custom onchain-actions base URL',
      expect.objectContaining({
        baseUrl: 'https://api.example.test',
        source: 'ONCHAIN_ACTIONS_API_URL',
      }),
    );
  });

  it('uses defaults without logging when no overrides are supplied', () => {
    delete process.env.ONCHAIN_ACTIONS_API_URL;

    const logger = vi.fn();
    const baseUrl = resolveOnchainActionsApiUrl({ logger });

    expect(baseUrl).toBe('https://api.emberai.xyz');
    expect(logger).not.toHaveBeenCalled();
  });

  it('defaults poll interval to 30 minutes', () => {
    delete process.env.GMX_ALLORA_POLL_INTERVAL_MS;
    expect(resolvePollIntervalMs()).toBe(1_800_000);
  });

  it('defaults to plan mode for transaction execution', () => {
    delete process.env.GMX_ALLORA_TX_SUBMISSION_MODE;

    expect(resolveGmxAlloraTxExecutionMode()).toBe('plan');
  });

  it('uses execute mode when submission mode is submit', () => {
    process.env.GMX_ALLORA_TX_SUBMISSION_MODE = 'submit';

    expect(resolveGmxAlloraTxExecutionMode()).toBe('execute');
  });

  it('uses plan mode when submission mode is plan', () => {
    process.env.GMX_ALLORA_TX_SUBMISSION_MODE = 'plan';

    expect(resolveGmxAlloraTxExecutionMode()).toBe('plan');
  });

  it('defaults E2E profile to live', () => {
    delete process.env.E2E_PROFILE;
    expect(resolveE2EProfile()).toBe('live');
  });

  it('accepts mocked E2E profile', () => {
    process.env.E2E_PROFILE = 'mocked';
    expect(resolveE2EProfile()).toBe('mocked');
  });

  it('falls back to live for unknown E2E profile values', () => {
    process.env.E2E_PROFILE = 'something-else';
    expect(resolveE2EProfile()).toBe('live');
  });

  it('parses delegations bypass flag', () => {
    delete process.env.DELEGATIONS_BYPASS;
    expect(resolveDelegationsBypass()).toBe(false);

    process.env.DELEGATIONS_BYPASS = 'true';
    expect(resolveDelegationsBypass()).toBe(true);

    process.env.DELEGATIONS_BYPASS = 'TRUE';
    expect(resolveDelegationsBypass()).toBe(true);

    process.env.DELEGATIONS_BYPASS = '1';
    expect(resolveDelegationsBypass()).toBe(true);

    process.env.DELEGATIONS_BYPASS = 'yes';
    expect(resolveDelegationsBypass()).toBe(true);

    process.env.DELEGATIONS_BYPASS = 'false';
    expect(resolveDelegationsBypass()).toBe(false);
  });

  it('defaults GMX mode to production', () => {
    delete process.env.GMX_ALLORA_MODE;
    expect(resolveGmxAlloraMode()).toBe('production');
  });

  it('parses GMX mode from environment', () => {
    process.env.GMX_ALLORA_MODE = 'debug';
    expect(resolveGmxAlloraMode()).toBe('debug');

    process.env.GMX_ALLORA_MODE = 'production';
    expect(resolveGmxAlloraMode()).toBe('production');
  });

  it('falls back to production for unknown GMX mode values', () => {
    process.env.GMX_ALLORA_MODE = 'staging';
    expect(resolveGmxAlloraMode()).toBe('production');
  });

  it('resolves agent wallet address from explicit address env var', () => {
    process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS = '0xAbCd000000000000000000000000000000000000';
    delete process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;

    expect(resolveAgentWalletAddress()).toBe('0xabcd000000000000000000000000000000000000');
  });

  it('throws when explicit agent wallet address does not match private key', () => {
    process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001';
    process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

    expect(() => resolveAgentWalletAddress()).toThrow(/does not match A2A_TEST_AGENT_NODE_PRIVATE_KEY/u);
  });

  it('resolves agent wallet address from private key when address is not provided', () => {
    delete process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS;
    process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

    const resolved = resolveAgentWalletAddress();
    expect(resolved).toMatch(/^0x[0-9a-f]{40}$/u);
  });

  it('throws when no agent wallet configuration is available', () => {
    delete process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS;
    delete process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;

    expect(() => resolveAgentWalletAddress()).toThrow(/Missing agent wallet configuration/u);
  });

  it('contains the curated Allora topic whitelist entries', () => {
    expect(ALLORA_TOPIC_WHITELIST).toEqual(
      expect.arrayContaining([
        { topicId: 1, pair: 'BTC/USD', horizonHours: 8, inferenceType: 'Log-Return' },
        { topicId: 3, pair: 'SOL/USD', horizonHours: 8, inferenceType: 'Log-Return' },
        { topicId: 14, pair: 'BTC/USD', horizonHours: 8, inferenceType: 'Price' },
        { topicId: 19, pair: 'NEAR/USD', horizonHours: 8, inferenceType: 'Log-Return' },
        { topicId: 2, pair: 'ETH/USD', horizonHours: 24, inferenceType: 'Log-Return' },
        { topicId: 16, pair: 'ETH/USD', horizonHours: 24, inferenceType: 'Log-Return' },
        { topicId: 2, pair: 'ETH/USD', horizonHours: 8, inferenceType: 'Log-Return' },
        { topicId: 17, pair: 'SOL/USD', horizonHours: 24, inferenceType: 'Log-Return' },
        { topicId: 10, pair: 'SOL/USD', horizonHours: 8, inferenceType: 'Price' },
      ]),
    );
  });

  it('uses whitelist metadata for active topic labels', () => {
    expect(ALLORA_TOPIC_LABELS.BTC).toBe('BTC/USD - Price - 8h');
    expect(ALLORA_TOPIC_LABELS.ETH).toBe('ETH/USD - Log-Return - 8h');
  });
});
