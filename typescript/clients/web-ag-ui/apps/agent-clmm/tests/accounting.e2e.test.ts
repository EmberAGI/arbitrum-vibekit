import { describe, expect, it } from 'vitest';

import { CAMELOT_PROTOCOL_ID } from '../src/accounting/camelotAdapter.js';
import { createCamelotNavSnapshot } from '../src/accounting/snapshot.js';
import { applyAccountingUpdate } from '../src/accounting/state.js';
import type { FlowLogEvent } from '../src/accounting/types.js';
import { EmberCamelotClient } from '../src/clients/emberApi.js';

const BASE_URL = process.env['EMBER_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';
const LIVE_TEST_TIMEOUT_MS = Number(process.env['EMBER_E2E_TIMEOUT_MS'] ?? 45_000);
const LIVE_LP_WALLET: `0x${string}` = (process.env['CLMM_E2E_LIVE_WALLET'] ??
  '0x2d2c313ec7650995b193a34e16be5b86eede872d') as `0x${string}`;

const client = new EmberCamelotClient(BASE_URL);

async function resolveFirstPositionPool() {
  const positions = await client.getWalletPositions(LIVE_LP_WALLET, 42161);
  if (positions.length === 0) {
    console.warn('Live LP wallet has no active Camelot positions');
    return null;
  }
  return positions[0]?.poolAddress ?? null;
}

describe('Accounting (e2e)', () => {
  it(
    'creates a NAV snapshot and computes accounting metrics (happy path)',
    async () => {
      // Given a live wallet with a managed Camelot pool
      const poolAddress = await resolveFirstPositionPool();
      if (!poolAddress) {
        return;
      }
      const hireTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const flowLog: FlowLogEvent[] = [
        {
          id: 'flow-hire-1',
          type: 'hire',
          timestamp: hireTimestamp,
          contextId: 'ctx-live',
          chainId: 42161,
          protocolId: CAMELOT_PROTOCOL_ID,
          usdValue: 1000,
        },
        {
          id: 'flow-1',
          type: 'supply',
          timestamp: new Date().toISOString(),
          contextId: 'ctx-live',
          chainId: 42161,
          protocolId: CAMELOT_PROTOCOL_ID,
          poolAddress,
        },
      ];

      // When we create a NAV snapshot
      const snapshot = await createCamelotNavSnapshot({
        contextId: 'ctx-live',
        trigger: 'cycle',
        walletAddress: LIVE_LP_WALLET,
        chainId: 42161,
        camelotClient: client,
        flowLog,
      });

      // Then the snapshot should include the managed position valuation
      expect(snapshot.contextId).toBe('ctx-live');
      expect(snapshot.protocolId).toBe(CAMELOT_PROTOCOL_ID);
      expect(snapshot.walletAddress).toBe(LIVE_LP_WALLET.toLowerCase() as `0x${string}`);
      expect(snapshot.positions.length).toBe(1);
      expect(snapshot.positions[0]?.poolAddress?.toLowerCase()).toBe(poolAddress.toLowerCase());
      expect(snapshot.totalUsd).toBeGreaterThanOrEqual(0);

      // And accounting metrics should be computed from the flow log + snapshot
      const accounting = applyAccountingUpdate({
        existing: undefined,
        flowEvents: flowLog,
        snapshots: [snapshot],
        now: new Date().toISOString(),
      });
      expect(accounting.initialAllocationUsd).toBe(1000);
      expect(accounting.positionsUsd).toBe(snapshot.totalUsd);
      expect(accounting.aumUsd).toBeGreaterThanOrEqual(snapshot.totalUsd);
      expect(accounting.highWaterMarkUsd).toBe(accounting.aumUsd);
      if (accounting.aumUsd !== undefined) {
        expect(accounting.lifetimePnlUsd).toBeCloseTo(accounting.aumUsd - 1000, 6);
        expect(accounting.lifetimeReturnPct).toBeCloseTo((accounting.aumUsd / 1000) - 1, 6);
      }
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});
