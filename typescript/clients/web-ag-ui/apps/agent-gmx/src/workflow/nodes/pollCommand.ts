import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import {
  buildTaskStatus,
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
import { executeTransaction } from '../../core/transaction.js';
import { createClients } from '../../clients/clients.js';

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

  const { agentWalletAddress } = await loadBootstrapContext();

  //   logInfo(`Poll Decision: `, decision);
  if (decision.kind === 'open-position' || decision.kind === 'close-position') {
    const acceptablePriceOpenPosition = parseUnits('3100', 30); // 3100 $ hardcoded market price of ETH
    const acceptablePriceClosePosition = parseUnits('3200', 30); // 3100 $ hardcoded market price of ETH

    const orderParams: GMXOrderParams = {
      receiver: agentWalletAddress,
      orderType: decision.kind === 'open-position' ? 2 : 4, // MarketIncrease (Open), MarketDecrease (Close)
      direction: decision.direction ?? 0,
      sizeDeltaUsd: parseUnits(decision.sizeUsd, 30),
      acceptablePrice:
        decision.kind === 'open-position'
          ? acceptablePriceOpenPosition
          : acceptablePriceClosePosition,
      collateralToken: decision.collateralToken,
      collateralAmount: parseUnits(decision.collateralAmount, 6), // assuming this is USDC for now
      marketAddress: decision.marketAddress,
      executionFee: parseEther('0.001'),
    };
    const { multicallCalldata, orderTypeName } = await createGmxCalldata(orderParams);
    logInfo(
      `\nDecision ${decision.kind} \nOrder Type: ${orderTypeName} \n${decision.direction == 0 ? 'Long Position' : 'Short Position'} Calldata`,
      {
        multicallCalldata,
      },
    );
    logInfo(`⏳ Executing GMX Order`);
    await executeGMXDecision({
      marketAddress: decision.marketAddress,
      data: multicallCalldata as unknown as `0x${string}`,
    });
  }

  if (decision.kind === 'hold') {
  }
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
  if (hasOpenPosition)
    return {
      kind: 'close-position',
      marketAddress: ctx.markets[0].marketToken as `0x${string}`,
      direction: 0,
      sizeUsd: '10',
      leverage: '2',
      collateralAmount: '5',
      collateralToken: ctx.markets[0].shortToken, // USDC
      reason: 'Existing GMX position detected; closing for demo',
    };

  // Case 3: hold position
  /// TODO: define position hold
  return {
    kind: 'hold',
    reason: 'Agent decision for holding position',
  };
}

export async function executeGMXDecision({
  data,
  marketAddress,
  delegationBundle,
  delegationsBypassActive,
}: {
  data: `0x${string}`;
  marketAddress: `0x${string}`;
  delegationBundle?: DelegationBundle;
  delegationsBypassActive?: boolean;
}) {
  const { account } = await loadBootstrapContext();
  if (delegationsBypassActive && delegationBundle) {
  }
  const clients = createClients(account);
  let receipt = await executeTransaction(clients, {
    to: marketAddress,
    data: data,
  });

  logInfo(`🧾 Receipt: \n`, receipt);
}
