import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import {
  buildTaskStatus,
  isTaskTerminal,
  type GMXState,
  type GMXUpdate,
  type GMXPositionView,
  type GMXAction,
  GMXMarket,
  GMXActivity,
  DelegationBundle,
  logInfo,
  GMXEvent,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';
import { loadBootstrapContext } from '../store.js';
import { GMXOrderParams, PositionDirection } from '../../domain/types.js';
import { parseEther, parseUnits } from 'viem';
import { createGmxCalldata } from '../helpers/create-gmx-calldata.js';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const pollCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<Command<string, GMXUpdate>> => {
  const mode = state.private.mode ?? 'debug';
  const pollingEvents: GMXEvent[] = [];

  if (!state.private.bootstrapped) {
    return new Command({
      goto: 'bootstrap',
    });
  }
  console.log('Inside Poll Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Started Polling for GMX Market(s)`,
  );
  pollingEvents.push(statusEvent);
  let decision: GMXAction;
  try {
    decision = await evaluateGMXDecision({
      markets: state.view.profile.allowedMarkets,
      tokens: state.view.profile.allowedTokens,
      telemetry: state.view.activity.telemetry,
    });
  } catch (err: any) {
    const failureMessage = (err as unknown as Error).message;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          events: [...pollingEvents, statusEvent],
          task,
        },
      },
      goto: 'summarize',
    });
  }

  const { account, agentWalletAddress } = await loadBootstrapContext();

  logInfo(`Poll Decision: `, decision);
  if (decision.kind === 'open-position') {
    const acceptablePrice = parseUnits('3100', 30); // 3100 $ hardcoded market price of ETH
    const { multicallCalldata, orderTypeName } = await createGmxCalldata({
      receiver: agentWalletAddress,
      orderType: 2,
      direction: decision.direction ?? 0,
      sizeDeltaUsd: parseUnits(decision.sizeUsd, 30),
      acceptablePrice: acceptablePrice,
      collateralToken: decision.collateralToken,
      collateralAmount: parseUnits(decision.collateralAmount, 6), // assuming this is USDC for now
      marketAddress: decision.marketAddress,
      executionFee: parseEther('0.001'),
    });
    logInfo(`Market ${orderTypeName} ${decision.direction == 0 ? 'Long' : 'Short'} Calldata`, {
      multicallCalldata,
    });
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
  markets: GMXMarket[] | undefined;
  tokens: string[] | undefined;
  telemetry: GMXActivity['telemetry'];
};

export async function evaluateGMXDecision(ctx: GMXDecisionContext): Promise<GMXAction> {
  const hasOpenPosition = (ctx.telemetry?.length ?? 0) > 0;
  if (!ctx.markets) {
    throw new Error('ERROR: Polling node missing required state (markets or tokens)');
  }
  // Case 1: No position → OPEN

  if (!hasOpenPosition) {
    // 10$ position with $5 collateral
    return {
      kind: 'open-position',
      marketAddress: ctx.markets[0].marketToken as `0x${string}`,
      direction: 0,
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

  if (action.kind === 'open-position') {
    /// TODO: Bring in the offchain util scripts for creating calldata for GMX execution
    /// TODO: Decide and Remove open, close and hold position Nodes
    // gmxPayload = {
    //   orderType: OrderType.MarketIncrease,
    //   direction: action.direction ?? 0, // hard-coded for long by default
    //   isLong: action.direction === 0,
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
