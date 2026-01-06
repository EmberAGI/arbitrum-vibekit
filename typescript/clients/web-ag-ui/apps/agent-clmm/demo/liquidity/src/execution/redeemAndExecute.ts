import {
  createExecution,
  ExecutionMode,
  getDeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import {
  BaseError,
  decodeAbiParameters,
  createClient,
  createPublicClient,
  createWalletClient,
  http,
  publicActions,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, mainnet } from "viem/chains";

import type { DelegationIntent, NormalizedTransaction } from "../delegations/emberDelegations.js";

export type RedeemAndExecuteResult = {
  txHashes: Hex[];
  receipts: TransactionReceipt[];
  gasSpentWei?: bigint;
};

type Execution = {
  target: `0x${string}`;
  value: bigint;
  callData: Hex;
};

function assertIsExecution(value: unknown): asserts value is Execution {
  if (typeof value !== "object" || value === null) {
    throw new Error("Internal error: createExecution returned a non-object");
  }
  if (!("target" in value) || !("value" in value) || !("callData" in value)) {
    throw new Error("Internal error: createExecution returned an unexpected shape");
  }

  const target = (value as { target?: unknown }).target;
  const callData = (value as { callData?: unknown }).callData;
  const innerValue = (value as { value?: unknown }).value;

  if (typeof target !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(target)) {
    throw new Error("Internal error: createExecution returned invalid target");
  }
  if (typeof callData !== "string" || !/^0x[0-9a-fA-F]*$/u.test(callData)) {
    throw new Error("Internal error: createExecution returned invalid callData");
  }
  if (typeof innerValue !== "bigint") {
    throw new Error("Internal error: createExecution returned invalid value");
  }
}

function createExecutionSafe(params: { target: `0x${string}`; value: bigint; callData: Hex }): Execution {
  const execution: unknown = createExecution(params);
  assertIsExecution(execution);
  return execution;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asHexString(value: unknown): Hex | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]*$/u.test(trimmed)) {
    return null;
  }
  if (trimmed.length < 10) {
    return null;
  }
  return trimmed.toLowerCase() as Hex;
}

function asHex(value: string): Hex | null {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]*$/u.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as Hex;
}

function findRevertData(value: unknown): Hex | null {
  const direct = asHexString(value);
  if (direct) {
    return direct;
  }
  if (!isRecord(value)) {
    return null;
  }
  const fromData = asHexString(value["data"]);
  if (fromData) {
    return fromData;
  }
  const fromResult = asHexString(value["result"]);
  if (fromResult) {
    return fromResult;
  }
  const fromCause = findRevertData(value["cause"]);
  if (fromCause) {
    return fromCause;
  }
  const fromError = findRevertData(value["error"]);
  if (fromError) {
    return fromError;
  }
  return null;
}

function decodeRevertData(data: Hex): string | null {
  const selector = data.slice(0, 10).toLowerCase();
  const payload = asHex(`0x${data.slice(10)}`);
  if (!payload) {
    return `revert data selector=${selector} (invalid payload)`;
  }

  // Error(string)
  if (selector === "0x08c379a0") {
    try {
      const [message] = decodeAbiParameters([{ type: "string" }], payload);
      return `revert: ${String(message)}`;
    } catch {
      return "revert: Error(string) (failed to decode)";
    }
  }

  // Panic(uint256)
  if (selector === "0x4e487b71") {
    try {
      const [code] = decodeAbiParameters([{ type: "uint256" }], payload);
      if (typeof code !== "bigint") {
        return "panic: Panic(uint256) (unexpected decoded type)";
      }
      return `panic: 0x${code.toString(16)}`;
    } catch {
      return "panic: Panic(uint256) (failed to decode)";
    }
  }

  return `revert data selector=${selector}`;
}

function formatViemError(error: unknown): string {
  if (error instanceof BaseError) {
    const parts = [`${error.name}: ${error.shortMessage}`];
    if (error.details) {
      parts.push(error.details);
    }
    if (Array.isArray(error.metaMessages) && error.metaMessages.length > 0) {
      parts.push(...error.metaMessages);
    }
    const revertData = findRevertData(error);
    if (revertData) {
      const decoded = decodeRevertData(revertData);
      if (decoded) {
        parts.push(decoded);
      }
    }
    if (error.cause instanceof BaseError) {
      parts.push(`cause: ${error.cause.shortMessage}`);
      if (error.cause.details) {
        parts.push(error.cause.details);
      }
      if (Array.isArray(error.cause.metaMessages) && error.cause.metaMessages.length > 0) {
        parts.push(...error.cause.metaMessages);
      }
      const causeRevertData = findRevertData(error.cause);
      if (causeRevertData) {
        const decoded = decodeRevertData(causeRevertData);
        if (decoded) {
          parts.push(decoded);
        }
      }
    } else if (error.cause instanceof Error) {
      parts.push(`cause: ${error.cause.message}`);
    }
    return parts.join("\n");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveChain(chainId: number) {
  if (chainId === arbitrum.id) {
    return arbitrum;
  }
  if (chainId === mainnet.id) {
    return mainnet;
  }
  throw new Error(`Unsupported chainId ${chainId} for demo execution (add a viem chain mapping)`);
}

function parseOptionalGasLimit(value: string | undefined): bigint | null {
  const raw = (value ?? "").trim();
  if (raw === "") {
    return null;
  }
  if (!/^\d+$/u.test(raw)) {
    throw new Error("DEMO_GAS_LIMIT must be a positive integer");
  }
  const parsed = BigInt(raw);
  if (parsed <= 0n) {
    throw new Error("DEMO_GAS_LIMIT must be a positive integer");
  }
  return parsed;
}

function getWordAt(params: { calldata: `0x${string}`; startIndex: number }): `0x${string}` | null {
  const start = 2 + params.startIndex * 2;
  const end = start + 64;
  if (start < 2 || end > params.calldata.length) {
    return null;
  }
  return `0x${params.calldata.slice(start, end)}`;
}

function txMatchesDelegationIntent(tx: NormalizedTransaction, intent: DelegationIntent): boolean {
  if (!intent.targets.includes(tx.to)) {
    return false;
  }
  if (!intent.selectors.includes(tx.selector)) {
    return false;
  }

  for (const pin of intent.allowedCalldata) {
    const word = getWordAt({ calldata: tx.data, startIndex: pin.startIndex });
    if (!word) {
      return false;
    }
    if (word.toLowerCase() !== pin.value.toLowerCase()) {
      return false;
    }
  }

  return true;
}

function maybeLogRedeemPlan(params: {
  permissionContexts: readonly (readonly Delegation[])[];
  modes: readonly Hex[];
  executions: readonly (readonly Execution[])[];
}): void {
  if ((process.env["DEMO_DEBUG_REDEEM"] ?? "false") !== "true") {
    return;
  }

  const summary = params.permissionContexts.map((chain, index) => {
    const delegation = chain[0];
    return {
      index,
      chainLength: chain.length,
      delegation: delegation
        ? {
            delegate: delegation.delegate,
            delegator: delegation.delegator,
            authority: delegation.authority,
          }
        : null,
      mode: params.modes[index],
      executions: (params.executions[index] ?? []).map((execution) => ({
        target: execution.target,
        value: execution.value.toString(),
        calldataBytes: Math.max(0, (execution.callData.length - 2) / 2),
        selector: execution.callData.length >= 10 ? execution.callData.slice(0, 10) : execution.callData,
      })),
    };
  });

  console.info(
    JSON.stringify(
      {
        message: "demo/liquidity: redeem plan debug",
        contexts: params.permissionContexts.length,
        modes: params.modes.length,
        executions: params.executions.length,
        summary,
      },
      null,
      2,
    ),
  );
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  chainId: number;
  rpcUrl: string;
  delegateePrivateKey: `0x${string}`;
  delegations: readonly Delegation[];
  delegationIntents: readonly DelegationIntent[];
  transactions: readonly NormalizedTransaction[];
}): Promise<RedeemAndExecuteResult> {
  const chain = resolveChain(params.chainId);
  const environment = getDeleGatorEnvironment(params.chainId);

  const account = privateKeyToAccount(params.delegateePrivateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(params.rpcUrl),
  });
  const simulationClient = createClient({
    account,
    chain,
    transport: http(params.rpcUrl),
  }).extend(publicActions);
  const publicClient = createPublicClient({
    chain,
    transport: http(params.rpcUrl),
  });

  if (params.delegations.length === 0) {
    throw new Error("No delegations provided for execution");
  }
  if (params.transactions.length === 0) {
    throw new Error("No transactions provided for execution");
  }

  if (params.delegations.length !== params.delegationIntents.length) {
    throw new Error(
      `Delegation/intents length mismatch (delegations=${params.delegations.length}, intents=${params.delegationIntents.length})`,
    );
  }

  const executionSegments: Array<{ intentIndex: number; executions: Execution[] }> = [];
  const intentSegmentCounts = new Map<number, number>();

  // Partition executions into contiguous intent segments to preserve order.
  for (const [txIndex, tx] of params.transactions.entries()) {
    const matchingIndex = params.delegationIntents.findIndex((intent) => txMatchesDelegationIntent(tx, intent));
    if (matchingIndex === -1) {
      throw new Error(
        `No delegation intent matched tx[${txIndex}] (to=${tx.to}, selector=${tx.selector}). Cannot safely execute.`,
      );
    }

    const lastSegment = executionSegments.at(-1);
    if (!lastSegment || lastSegment.intentIndex !== matchingIndex) {
      executionSegments.push({ intentIndex: matchingIndex, executions: [] });
      intentSegmentCounts.set(matchingIndex, (intentSegmentCounts.get(matchingIndex) ?? 0) + 1);
    }

    const currentSegment = executionSegments.at(-1);
    if (!currentSegment) {
      throw new Error("Internal error: failed to create execution segment");
    }
    currentSegment.executions.push(
      createExecutionSafe({
        target: tx.to,
        value: tx.value,
        callData: tx.data,
      }),
    );
  }

  const requiresMultipleRedemptions = [...intentSegmentCounts.values()].some((count) => count > 1);
  if (requiresMultipleRedemptions) {
    console.info(
      `demo/liquidity: split redeems required to preserve intent order (${executionSegments.length} segments)`,
    );
  }

  const redemptionPlans = requiresMultipleRedemptions
    ? executionSegments.map((segment) => ({
        permissionContexts: [[params.delegations[segment.intentIndex]]],
        executions: [segment.executions],
        modes: [
          segment.executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault,
        ],
      }))
    : [
        {
          permissionContexts: executionSegments.map((segment) => [params.delegations[segment.intentIndex]]),
          executions: executionSegments.map((segment) => segment.executions),
          modes: executionSegments.map((segment) =>
            segment.executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault,
          ),
        },
      ];

  const manualGasLimit = parseOptionalGasLimit(process.env["DEMO_GAS_LIMIT"]);
  const txHashes: Hex[] = [];
  const receipts: TransactionReceipt[] = [];
  let totalGasSpentWei: bigint | undefined;

  for (const [planIndex, plan] of redemptionPlans.entries()) {
    maybeLogRedeemPlan({ permissionContexts: plan.permissionContexts, modes: plan.modes, executions: plan.executions });

    try {
      const simulation = await DelegationManager.simulate.redeemDelegations({
        client: simulationClient,
        delegationManagerAddress: environment.DelegationManager,
        delegations: plan.permissionContexts,
        modes: plan.modes,
        executions: plan.executions,
      });

      const estimatedGas =
        typeof simulation.request.gas === "bigint" ? simulation.request.gas : undefined;
      const gas = manualGasLimit ?? (estimatedGas ? (estimatedGas * 12n) / 10n : undefined);

      const txHash = await walletClient.sendTransaction({
        to: environment.DelegationManager,
        data: DelegationManager.encode.redeemDelegations({
          delegations: plan.permissionContexts,
          modes: plan.modes,
          executions: plan.executions,
        }),
        value: 0n,
        ...(gas ? { gas } : {}),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      txHashes.push(txHash);
      receipts.push(receipt);
      if (receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined) {
        totalGasSpentWei =
          (totalGasSpentWei ?? 0n) + receipt.gasUsed * receipt.effectiveGasPrice;
      }
    } catch (error: unknown) {
      const totalCalls = plan.executions.reduce((sum, group) => sum + group.length, 0);
      const message = `redeemDelegations simulation reverted (segment=${planIndex + 1}/${redemptionPlans.length}, groupCount=${plan.executions.length}, totalCalls=${totalCalls}):\n${formatViemError(error)}`;
      throw new Error(message, { cause: error });
    }
  }

  return { txHashes, receipts, gasSpentWei: totalGasSpentWei };
}
