import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import {
  type ClmmRebalanceRequest,
  type ClmmSwapRequest,
  type TransactionInformation,
} from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import {
  buildDelegationRequestBundle,
  EmberEvmTransactionSchema,
  type EmberEvmTransaction,
} from '../../delegations/emberDelegations.js';
import { getCamelotClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type DelegationBundle,
  type DelegationSigningInterrupt,
  type SignedDelegation,
  type UnsignedDelegation,
} from '../context.js';
import { estimateTokenAllocationsUsd } from '../planning/allocations.js';
import { loadBootstrapContext } from '../store.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/u)
  .transform((value) => value.toLowerCase() as `0x${string}`);

const DelegationCaveatSchema = z.object({
  enforcer: HexSchema,
  terms: HexSchema,
  args: HexSchema,
});

const SignedDelegationSchema = z.object({
  delegate: HexSchema,
  delegator: HexSchema,
  authority: HexSchema,
  caveats: z.array(DelegationCaveatSchema),
  salt: HexSchema,
  signature: HexSchema,
});

const DelegationSigningResponseSchema = z.union([
  z.object({
    outcome: z.literal('signed'),
    signedDelegations: z.array(SignedDelegationSchema).min(1),
  }),
  z.object({
    outcome: z.literal('rejected'),
  }),
]);

function isDelegationsBypassActive(): boolean {
  return process.env['CLMM_DELEGATIONS_BYPASS'] === 'true';
}

function minNonZero(value: bigint): bigint {
  return value > 0n ? value : 1n;
}

function asEmberTransactions(transactions: TransactionInformation[]): EmberEvmTransaction[] {
  return z.array(EmberEvmTransactionSchema).parse(transactions);
}

function basesMatchUnsigned(params: { expected: UnsignedDelegation; received: SignedDelegation }): boolean {
  const normalizeCaveats = (caveats: UnsignedDelegation['caveats']) =>
    caveats.map((caveat) => ({
      enforcer: caveat.enforcer.toLowerCase(),
      terms: caveat.terms.toLowerCase(),
      args: caveat.args.toLowerCase(),
    }));

  return (
    params.expected.delegate.toLowerCase() === params.received.delegate.toLowerCase() &&
    params.expected.delegator.toLowerCase() === params.received.delegator.toLowerCase() &&
    params.expected.authority.toLowerCase() === params.received.authority.toLowerCase() &&
    params.expected.salt.toLowerCase() === params.received.salt.toLowerCase() &&
    JSON.stringify(normalizeCaveats(params.expected.caveats)) ===
      JSON.stringify(normalizeCaveats(params.received.caveats))
  );
}

export const collectDelegationsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  if (isDelegationsBypassActive()) {
    logInfo('collectDelegations: bypass active; skipping delegation onboarding');
    return {
      view: {
        delegationsBypassActive: true,
      },
    };
  }

  if (state.view.delegationBundle) {
    logInfo('collectDelegations: delegation bundle already present; skipping step');
    return {
      view: {
        delegationBundle: state.view.delegationBundle,
      },
    };
  }

  const operatorInput = state.view.operatorInput;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Operator input missing before delegation step';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: [] },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const selectedPool = state.view.selectedPool;
  if (!selectedPool) {
    const failureMessage = 'ERROR: Selected pool missing before delegation step';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: [] },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const camelotClient = getCamelotClient();
  const { agentWalletAddress } = await loadBootstrapContext();

  const delegatorAddress = normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  const delegateeAddress = normalizeHexAddress(agentWalletAddress, 'delegatee wallet address');
  const baseContributionUsd = operatorInput.baseContributionUsd ?? 5_000;

  const warnings: string[] = [];

  const chainIdString = ARBITRUM_CHAIN_ID.toString();
  const poolIdentifier = { chainId: chainIdString, address: normalizeHexAddress(selectedPool.address, 'pool address') };

  let desired: { token0: bigint; token1: bigint };
  try {
    desired = estimateTokenAllocationsUsd(selectedPool, baseContributionUsd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureMessage = `ERROR: Unable to estimate initial token allocations for delegation planning: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const plannedTransactions: EmberEvmTransaction[] = [];

  const fundingToken = state.view.fundingTokenInput?.fundingTokenAddress
    ? normalizeHexAddress(state.view.fundingTokenInput.fundingTokenAddress, 'funding token address')
    : undefined;

  if (fundingToken) {
    const swapTargets: Array<{ toToken: `0x${string}`; amountOut: bigint }> = [];
    if (fundingToken.toLowerCase() !== selectedPool.token0.address.toLowerCase()) {
      swapTargets.push({ toToken: selectedPool.token0.address, amountOut: desired.token0 });
    }
    if (fundingToken.toLowerCase() !== selectedPool.token1.address.toLowerCase()) {
      swapTargets.push({ toToken: selectedPool.token1.address, amountOut: desired.token1 });
    }

    for (const target of swapTargets) {
      try {
        const request: ClmmSwapRequest = {
          walletAddress: delegatorAddress,
          amount: target.amountOut.toString(),
          amountType: 'exactOut',
          fromTokenUid: { chainId: chainIdString, address: fundingToken },
          toTokenUid: { chainId: chainIdString, address: target.toToken },
        };
        const response = await camelotClient.requestSwap(request);
        plannedTransactions.push(...asEmberTransactions(response.transactions));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(
          `WARNING: Failed to request swap plan from fundingToken=${fundingToken} to token=${target.toToken}: ${message}`,
        );
      }
    }
  }

  // Include a small swap in each direction for ongoing rebalance needs (best effort).
  const sampleSwapAmount0 = minNonZero(desired.token0 / 100n);
  const sampleSwapAmount1 = minNonZero(desired.token1 / 100n);
  try {
    const request: ClmmSwapRequest = {
      walletAddress: delegatorAddress,
      amount: sampleSwapAmount0.toString(),
      amountType: 'exactIn',
      fromTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
      toTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
    };
    const response = await camelotClient.requestSwap(request);
    plannedTransactions.push(...asEmberTransactions(response.transactions));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`WARNING: Failed to request swap plan token0→token1: ${message}`);
  }
  try {
    const request: ClmmSwapRequest = {
      walletAddress: delegatorAddress,
      amount: sampleSwapAmount1.toString(),
      amountType: 'exactIn',
      fromTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
      toTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
    };
    const response = await camelotClient.requestSwap(request);
    plannedTransactions.push(...asEmberTransactions(response.transactions));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`WARNING: Failed to request swap plan token1→token0: ${message}`);
  }

  try {
    const request: ClmmRebalanceRequest = {
      walletAddress: delegatorAddress,
      supplyChain: chainIdString,
      poolIdentifier,
      range: { type: 'full' },
      payableTokens: [
        { tokenUid: { chainId: chainIdString, address: selectedPool.token0.address }, amount: desired.token0.toString() },
        { tokenUid: { chainId: chainIdString, address: selectedPool.token1.address }, amount: desired.token1.toString() },
      ],
    };
    const response = await camelotClient.requestRebalance(request);
    plannedTransactions.push(...asEmberTransactions(response.transactions));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`WARNING: Failed to request supply plan for delegation generation: ${message}`);
  }

  try {
    const response = await camelotClient.requestWithdrawal({
      walletAddress: delegatorAddress,
      poolTokenUid: poolIdentifier,
    });
    plannedTransactions.push(...asEmberTransactions(response.transactions));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`WARNING: Failed to request withdraw plan for delegation generation: ${message}`);
  }

  if (plannedTransactions.length === 0) {
    const failureMessage =
      'ERROR: Unable to generate any Ember transactions for delegation planning; cannot safely derive delegations.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const delegationRequest = buildDelegationRequestBundle({
    delegatorAddress,
    delegateeAddress,
    transactions: plannedTransactions,
  });

  warnings.push(...delegationRequest.warnings);

  const request: DelegationSigningInterrupt = {
    type: 'clmm-delegation-signing-request',
    message: 'Review and sign the required delegations. If anything looks unsafe, reject and adjust your configuration.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseSchema),
    chainId: delegationRequest.chainId,
    delegationManager: delegationRequest.environment.DelegationManager,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: [...delegationRequest.delegationsToSign],
    descriptions: [...delegationRequest.delegationDescriptions],
    warnings: [...warnings],
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting delegation signatures to continue CLMM onboarding.',
  );
  await copilotkitEmitState(config, {
    view: {
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
    },
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

  const parsed = DelegationSigningResponseSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid delegation signing response: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  if (parsed.data.outcome === 'rejected') {
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'rejected',
      'Delegation signing was rejected. The agent will not proceed.',
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: 'Delegation signing rejected by user.',
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const signedDelegations = parsed.data.signedDelegations as unknown as SignedDelegation[];
  if (signedDelegations.length !== delegationRequest.delegationsToSign.length) {
    const failureMessage = `Delegation signing returned unexpected count (expected=${delegationRequest.delegationsToSign.length}, got=${signedDelegations.length})`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  for (let index = 0; index < signedDelegations.length; index += 1) {
    const expected = delegationRequest.delegationsToSign[index];
    const received = signedDelegations[index];
    if (!expected || !received) {
      continue;
    }
    if (!basesMatchUnsigned({ expected, received })) {
      const failureMessage = `Delegation signing returned a mismatched delegation at index ${index}`;
      const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
      });
      return {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      };
    }
  }

  const delegationBundle: DelegationBundle = {
    chainId: delegationRequest.chainId,
    delegationManager: delegationRequest.environment.DelegationManager,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: delegationRequest.delegationIntents.map((intent) => ({
      target: intent.target,
      selector: intent.selector,
      allowedCalldata: [...intent.allowedCalldata],
    })),
    descriptions: [...delegationRequest.delegationDescriptions],
    warnings,
  };

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Delegations signed. Continuing onboarding.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  return {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      delegationBundle,
    },
  };
};
