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
  logInfo,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';
import { createClients } from '../../clients/clients.js';
import { loadBootstrapContext } from '../store.js';
import { GMXOrderParams } from '../../domain/types.js';
import { parseEther, parseUnits } from 'viem';
import { createGmxCalldata } from '../helpers/create-gmx-calldata.js';
import { PositionDirection } from '../helpers/utils/types.js';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const pollCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  const mode = state.private.mode ?? 'debug';

  if (!state.private.bootstrapped) {
    return new Command({
      goto: 'bootstrap',
    });
  }
  console.log('Inside Poll Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Starting Polling for GMX Market(s)`,
  );

  const decision: GMXAction = await evaluateGMXDecision({
    markets: state.view.profile.allowedMarkets,
    tokens: state.view.profile.allowedTokens,
    telemetry: state.view.activity.telemetry,
  });

  const { account, agentWalletAddress } = await loadBootstrapContext();

  logInfo(`Poll Decision: `, decision);
  if (decision.kind === 'open-position') {
    const acceptablePrice = parseUnits('3100', 30); // 3100 $ hardcoded market price of ETH
    logInfo(
      `Market ${decision.direction == 0 ? 'Long' : 'Short'} Calldata`,
      await createGmxCalldata({
        receiver: agentWalletAddress,
        orderType: 2,
        direction: decision.direction ?? 0,
        sizeDeltaUsd: parseUnits(decision.sizeUsd, 30),
        acceptablePrice: acceptablePrice,
        collateralToken: decision.collateralToken,
        collateralAmount: parseUnits(decision.collateralAmount, 6), // assuming this is USDC for now
        marketAddress: decision.marketAddress,
        executionFee: parseEther('0.001'),
      }),
    );
  }

  /// TODO add states here
  return new Command({
    goto: 'summarize',
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
};

export async function evaluateGMXDecision(ctx: GMXDecisionContext): GMXAction {
  const hasOpenPosition = (ctx.telemetry?.length ?? 0) > 0;
  // Case 1: No position → OPEN
  if (!hasOpenPosition) {
    // 10$ position with $5 collateral
    return {
      kind: 'open-position',
      marketAddress: ctx.markets[0].marketToken as `0x${string}`,
      direction: PositionDirection.Long,
      sizeUsd: '10',
      leverage: '2',
      collateralAmount: '5',
      collateralToken: ctx.markets[0].shortToken, // USDC
      reason: 'No open GMX position detected; opening demo long',
    };
  }

  // Case 2: Position exists → CLOSE
  return {
    kind: 'close-position',
    marketAddress: ctx.markets[0].marketToken as `0x${string}`,
    reason: 'Existing GMX position detected; closing for demo',
  };
}

export async function executeGMXDecision({
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
  const { account } = await loadBootstrapContext();
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
