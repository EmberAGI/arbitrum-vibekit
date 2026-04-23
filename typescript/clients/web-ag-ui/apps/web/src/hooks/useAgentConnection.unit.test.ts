import { describe, expect, it } from 'vitest';

import { normalizeAgentInterrupt, selectActiveInterrupt } from '../utils/interruptSelection';
import type { AgentInterrupt } from '../types/agent';

describe('interruptSelection', () => {
  it('normalizes JSON-string pending interrupt payloads', () => {
    const payload = JSON.stringify({
      type: 'operator-config-request',
      message: 'Configure operator',
    });

    expect(normalizeAgentInterrupt(payload)).toEqual({
      type: 'operator-config-request',
      message: 'Configure operator',
    });
  });

  it('returns null for unknown payloads', () => {
    expect(normalizeAgentInterrupt({ type: 'unknown-interrupt', message: 'x' })).toBeNull();
    expect(normalizeAgentInterrupt('{"type":"unknown-interrupt"}')).toBeNull();
    expect(normalizeAgentInterrupt('{not-json')).toBeNull();
  });

  it('prefers stream interrupt over refresh fallback', () => {
    const streamInterrupt: AgentInterrupt = {
      type: 'operator-config-request',
      message: 'From stream',
    };
    const refreshPendingInterrupt: AgentInterrupt = {
      type: 'gmx-setup-request',
      message: 'From refresh',
    };

    expect(selectActiveInterrupt({ streamInterrupt, syncPendingInterrupt: refreshPendingInterrupt })).toEqual(streamInterrupt);
  });

  it('uses refresh fallback when stream interrupt is absent', () => {
    const refreshPendingInterrupt: AgentInterrupt = {
      type: 'clmm-delegation-signing-request',
      message: 'Sign delegations',
      chainId: 42161,
      delegationManager: '0x0000000000000000000000000000000000000001',
      delegatorAddress: '0x0000000000000000000000000000000000000002',
      delegateeAddress: '0x0000000000000000000000000000000000000003',
      delegationsToSign: [],
      descriptions: [],
      warnings: [],
    };

    expect(selectActiveInterrupt({ streamInterrupt: null, syncPendingInterrupt: refreshPendingInterrupt })).toEqual(
      refreshPendingInterrupt,
    );
  });
});
