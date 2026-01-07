import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import {
  buildTaskStatus,
  type GMXTradeLog,
  isTaskTerminal,
  type GMXState,
  type GMXUpdate,
  type GMXPositionView,
  type GMXAction,
  GMXMarket,
  GMXActivity,
  DelegationBundle,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';
import { createClients } from '../../clients/clients.js';
import { loadBootstrapContext } from '../store.js';
import { GMXOrderParams } from '../../domain/types.js';
import { parseUnits } from 'viem';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const pollCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  const mode = state.private.mode ?? 'debug';
  console.log('Inside Poll Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Starting Polling for GMX Market(s)`,
  );
  const hasPosition = Array.isArray(state.view.positions) && state.view.positions.length > 0;

  if (!hasPosition) {
    return new Command({
      goto: 'openPositionCommand',
      update: {
        view: {
          task,
        },
        private: {
          mode,
        },
      },
    });
  }

  return new Command({
    goto: 'holdPositionCommand',
    update: {
      view: {
        task,
      },
      private: {
        mode,
      },
    },
  });
};

// Helper
export type GMXDecisionContext = {
  markets: GMXMarket[];
  tokens: string[];
  telemetry: GMXActivity['telemetry'];
  marketAddress: `0x${string}`;
};

export function evaluateGMXDecision(ctx: GMXDecisionContext): GMXAction {
  const hasOpenPosition = (ctx.telemetry?.length ?? 0) > 0;

  // Case 1: No position → OPEN
  if (!hasOpenPosition) {
    return {
      kind: 'open-position',
      marketAddress: ctx.marketAddress,
      direction: PositionDirection.Long,
      sizeUsd: '10',
      leverage: '2',
      collateralToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
      reason: 'No open GMX position detected; opening demo long',
    };
  }

  // Case 2: Position exists → CLOSE
  return {
    kind: 'close-position',
    marketAddress: ctx.marketAddress,
    reason: 'Existing GMX position detected; closing for demo',
  };
}

export function executeGMXDecision({
  action,
  delegationBundle,
  delegationsBypassActive,
  marketAddress,
  positionKey,
}: {
  action: GMXAction;
  delegationBundle?: DelegationBundle;
  delegationsBypassActive?: boolean;
  marketAddress: `0x${string}`;
  positionKey?: `0x${string}`;
}) {
  if (action.kind === 'hold') {
    throw new Error('executeDecision invoked with hold action');
  }
  const { account } = loadBootstrapContext();
  const gmxPayload: GMXOrderParams = {};
  if (action.kind === 'open-position') {
    /// TODO: Bring in the offchain util scripts for creating calldata for GMX execution
    /// TODO: Decide and Remove open, close and hold position Nodes
    // gmxPayload = {
    //   orderType: OrderType.MarketIncrease,
    //   direction: action.direction ?? 0, // hard-coded for long by default
    //   isLong: action.direction === PositionDirection.Long,
    //   marketAddress,
    //   sizeDeltaUsd: parseUnits('2', 30), // naive - 2 USD hardcoded
    //   acceptablePrice: BigInt(0), // market order
    //   collateralToken: action.collateralToken ?? action.,
    //   collateralAmount: BigInt(10) * BigInt(1e6), // 10 USDC
    //   executionFee: parseEther('0.01'), // ~0.01 ETH
    // };
  } else if (action.kind === 'close-position') {
  }
}
