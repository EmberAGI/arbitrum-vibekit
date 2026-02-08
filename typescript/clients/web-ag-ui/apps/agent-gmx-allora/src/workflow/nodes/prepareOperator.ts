import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import {
  ARBITRUM_CHAIN_ID,
  resolveGmxAlloraTxExecutionMode,
  resolveMinNativeEthWei,
} from '../../config/constants.js';
import { type ResolvedGmxConfig } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
  type GmxFundWalletInterrupt,
} from '../context.js';
import { AGENT_WALLET_ADDRESS, MARKETS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FundWalletAckSchema = z.object({
  acknowledged: z.literal(true),
});

function formatEth(wei: bigint): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = wei % base;
  if (fraction === 0n) {
    return `${whole}`;
  }
  const fractionPadded = fraction.toString().padStart(18, '0');
  const fractionTrimmed = fractionPadded.replace(/0+$/u, '').slice(0, 6);
  return fractionTrimmed.length ? `${whole}.${fractionTrimmed}` : `${whole}`;
}

function extractNativeEthWei(params: {
  balances: Array<{ tokenUid: { chainId: string }; amount: string; symbol?: string; decimals?: number }>;
}): bigint {
  const eth = params.balances.find(
    (balance) =>
      balance.tokenUid.chainId === ARBITRUM_CHAIN_ID.toString() &&
      balance.symbol?.toUpperCase() === 'ETH',
  );
  if (!eth) {
    return 0n;
  }
  const decimals = eth.decimals ?? 18;
  if (decimals !== 18) {
    // onchain-actions may omit decimals; treat unexpected values as unknown.
    return 0n;
  }
  try {
    return BigInt(eth.amount);
  } catch {
    return 0n;
  }
}

function resolveEmbeddedExecutionWalletAddress(): `0x${string}` | undefined {
  const raw = process.env['GMX_ALLORA_EMBEDDED_PRIVATE_KEY'];
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{64}$/u.test(trimmed)) {
    return undefined;
  }
  return privateKeyToAccount(trimmed as `0x${string}`).address;
}

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput } = state.view;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    const failureMessage = 'ERROR: Funding token input missing before strategy setup';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const fundingTokenAddress = normalizeHexAddress(
    fundingTokenInput.fundingTokenAddress,
    'funding token address',
  );

  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  if (!delegationsBypassActive && !state.view.delegationBundle) {
    const failureMessage =
      'ERROR: Delegation bundle missing. Complete delegation signing before continuing.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
	    });
	  }

  const txExecutionMode = resolveGmxAlloraTxExecutionMode();
  const embeddedSubmissionWalletAddress = resolveEmbeddedExecutionWalletAddress();

  const operatorSubmissionWallet =
    delegationsBypassActive && txExecutionMode === 'execute'
      ? embeddedSubmissionWalletAddress ??
        (() => {
          throw new Error(
            'GMX_ALLORA_EMBEDDED_PRIVATE_KEY is required when GMX_ALLORA_TX_SUBMISSION_MODE=submit and delegations bypass is active.',
          );
        })()
      : delegationsBypassActive
        ? AGENT_WALLET_ADDRESS
        : operatorWalletAddress;
  const minNativeEthWei = resolveMinNativeEthWei();
  const onchainActionsClient = getOnchainActionsClient();
  const balances = await onchainActionsClient.listWalletBalances({
    walletAddress: operatorSubmissionWallet,
  });
  const nativeEthWei = extractNativeEthWei({
    balances: balances as Array<{
      tokenUid: { chainId: string };
      amount: string;
      symbol?: string;
      decimals?: number;
    }>,
  });

  if (nativeEthWei < minNativeEthWei) {
    const message = [
      `WARNING: Wallet ${operatorSubmissionWallet} needs native ETH on Arbitrum to cover gas and GMX execution fees.`,
      `Minimum required: ~${formatEth(minNativeEthWei)} ETH.`,
      'Fund the wallet, then click Continue.',
    ].join(' ');

    const request: GmxFundWalletInterrupt = {
      type: 'gmx-fund-wallet-request',
      message,
      payloadSchema: z.toJSONSchema(FundWalletAckSchema),
      walletAddress: operatorSubmissionWallet,
      minNativeEthWei: minNativeEthWei.toString(),
    };

    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    await copilotkitEmitState(config, {
      view: { onboarding: state.view.onboarding, task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });

    const incoming: unknown = await interrupt(request);
    let inputToParse: unknown = incoming;
    if (typeof incoming === 'string') {
      try {
        inputToParse = JSON.parse(incoming);
      } catch {
        // ignore
      }
    }

    const parsedAck = FundWalletAckSchema.safeParse(inputToParse);
    if (!parsedAck.success) {
      return new Command({ goto: '__end__' });
    }

    // "Ack + retry" flow. End this run and let the UI trigger a new cycle which re-checks balances.
    return new Command({ goto: '__end__' });
  }

  const targetMarket = MARKETS.find((market) => market.baseSymbol === operatorInput.targetMarket);

  if (!targetMarket) {
    const failureMessage = `ERROR: Unsupported GMX market ${operatorInput.targetMarket}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const operatorConfig: ResolvedGmxConfig = {
    walletAddress: operatorSubmissionWallet,
    baseContributionUsd: operatorInput.usdcAllocation,
    fundingTokenAddress,
    targetMarket,
    maxLeverage: targetMarket.maxLeverage,
  };

  logInfo('GMX Allora strategy configuration established', {
    operatorWalletAddress,
    usdcAllocation: operatorConfig.baseContributionUsd,
    fundingToken: fundingTokenAddress,
    market: `${targetMarket.baseSymbol}/${targetMarket.quoteSymbol}`,
    maxLeverage: targetMarket.maxLeverage,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Preparing ${targetMarket.baseSymbol} GMX strategy from agent wallet.`
      : `Delegations active. Preparing ${targetMarket.baseSymbol} GMX strategy from user wallet ${operatorWalletAddress}.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];

  return {
    view: {
      operatorConfig,
      selectedPool: targetMarket,
      metrics: {
        lastSnapshot: targetMarket,
        previousPrice: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
      },
      task,
      activity: { events, telemetry: state.view.activity.telemetry },
      transactionHistory: state.view.transactionHistory,
      profile: state.view.profile,
    },
    private: {
      cronScheduled: false,
    },
  };
};
