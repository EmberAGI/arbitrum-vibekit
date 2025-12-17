import {
  createDelegation,
  getDeleGatorEnvironment,
  signDelegation,
  type DeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
import { decodeFunctionData, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

export const EmberEvmTransactionSchema = z.object({
  type: z.literal("EVM_TX"),
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "to must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  data: z
    .string()
    .regex(/^0x[0-9a-fA-F]*$/u, "data must be 0x-prefixed hex")
    .transform((value) => value.toLowerCase() as `0x${string}`),
  value: z.string().optional(),
  chainId: z.string(),
});

export type EmberEvmTransaction = z.infer<typeof EmberEvmTransactionSchema>;

export type DelegationGenerationOptions = {
  allowNonZeroValue?: boolean;
  allowEmptyCalldata?: boolean;
  enforceTargetAllowlist?: boolean;
  targetAllowlist?: readonly `0x${string}`[];
  consolidation?: "auto" | "single" | "perTarget";
  environment?: DeleGatorEnvironment;
};

export type NormalizedTransaction = {
  to: `0x${string}`;
  data: `0x${string}`;
  selector: `0x${string}`;
  value: bigint;
  chainId: number;
};

export type SelectorDiagnostics = {
  target: `0x${string}`;
  selectors: readonly `0x${string}`[];
};

export type DelegationGenerationResult = {
  chainId: number;
  normalizedTransactions: readonly NormalizedTransaction[];
  selectorDiagnostics: readonly SelectorDiagnostics[];
  delegations: readonly Delegation[];
  delegationIntents: readonly DelegationIntent[];
  delegationDescriptions: readonly string[];
  warnings: readonly string[];
};

export type NormalizationResult = {
  chainId: number;
  normalizedTransactions: readonly NormalizedTransaction[];
  selectorDiagnostics: readonly SelectorDiagnostics[];
  warnings: readonly string[];
};

export type AllowedCalldataPin = {
  startIndex: number;
  value: `0x${string}`;
};

export type DelegationIntent = {
  targets: readonly `0x${string}`[];
  selectors: readonly `0x${string}`[];
  allowedCalldata: readonly AllowedCalldataPin[];
};

const MULTICALL_SELECTORS = {
  uniswapV3StyleMulticallBytesArray: "0xac9650d8",
  squidFundAndRunMulticall: "0x58181a80",
} as const;

const MULTICALL_LIKE_SELECTORS: ReadonlySet<`0x${string}`> = new Set([
  // Supported (expanded)
  MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray,
  MULTICALL_SELECTORS.squidFundAndRunMulticall,
  // Common multicall variants we currently fail-closed on.
  "0x5ae401dc", // multicall(uint256,bytes[]) (e.g., some routers)
  "0x1f0464d1", // multicall(bytes32,bytes[]) (seen in some aggregators)
]);

const UNISWAP_V3_STYLE_MULTICALL_ABI = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const satisfies Abi;

const FUND_AND_RUN_MULTICALL_ABI = [
  {
    type: "function",
    name: "fundAndRunMulticall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fundingToken", type: "address" },
      { name: "fundingAmount", type: "uint256" },
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "callType", type: "uint8" },
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const satisfies Abi;

function parseChainId(chainId: string): number {
  const trimmed = chainId.trim();
  if (!/^\d+$/u.test(trimmed)) {
    throw new Error(`Invalid chainId "${chainId}" (expected decimal string)`);
  }
  const asNumber = Number(trimmed);
  if (!Number.isSafeInteger(asNumber) || asNumber <= 0) {
    throw new Error(`Invalid chainId "${chainId}" (expected positive integer)`);
  }
  return asNumber;
}

function parseValue(value: string | undefined): bigint {
  const raw = (value ?? "0").trim();
  if (raw === "") {
    return 0n;
  }
  let parsed: bigint;
  try {
    parsed = BigInt(raw);
  } catch {
    throw new Error(`Invalid value "${value ?? ""}" (expected bigint-compatible string)`);
  }
  if (parsed < 0n) {
    throw new Error(`Invalid value "${value ?? ""}" (negative not allowed)`);
  }
  return parsed;
}

function deriveSelector(
  calldata: `0x${string}`,
  { allowEmptyCalldata }: { allowEmptyCalldata: boolean },
): `0x${string}` {
  if (calldata === "0x") {
    if (!allowEmptyCalldata) {
      throw new Error("Empty calldata (0x) is not allowed by configuration");
    }
    return "0x00000000";
  }
  if (calldata.length < 10) {
    throw new Error(`Calldata too short to contain selector: "${calldata}"`);
  }
  return calldata.slice(0, 10) as `0x${string}`;
}

function asLowercaseAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`;
}

function toAbiWordAddress(address: `0x${string}`): `0x${string}` {
  const raw = address.toLowerCase().slice(2);
  return `0x${"0".repeat(24)}${raw}` as `0x${string}`;
}

function findAbiWordOccurrences(calldata: `0x${string}`, word: `0x${string}`): AllowedCalldataPin[] {
  const needle = word.slice(2);
  const haystack = calldata.slice(2);
  if (needle.length === 0 || haystack.length < needle.length) {
    return [];
  }

  const pins: AllowedCalldataPin[] = [];
  let fromIndex = 0;
  while (true) {
    const found = haystack.indexOf(needle, fromIndex);
    if (found === -1) {
      break;
    }
    if (found % 2 === 0) {
      pins.push({
        startIndex: found / 2,
        value: word,
      });
    }
    fromIndex = found + 1;
  }
  return pins;
}

function intersectPins(pinSets: readonly AllowedCalldataPin[][]): AllowedCalldataPin[] {
  if (pinSets.length === 0) {
    return [];
  }
  const keyOf = (pin: AllowedCalldataPin) => `${pin.startIndex}:${pin.value}`;
  let intersection = new Set(pinSets[0]?.map(keyOf) ?? []);
  for (let index = 1; index < pinSets.length; index += 1) {
    const next = new Set(pinSets[index]?.map(keyOf) ?? []);
    intersection = new Set([...intersection].filter((key) => next.has(key)));
  }
  return [...intersection]
    .map((key): AllowedCalldataPin => {
      const [startIndexRaw, value] = key.split(":");
      return {
        startIndex: Number(startIndexRaw),
        value: value as `0x${string}`,
      };
    })
    .sort((a, b) => (a.startIndex - b.startIndex) || a.value.localeCompare(b.value));
}

function getFirstArgWord(calldata: `0x${string}`): `0x${string}` | null {
  // selector (4 bytes) + arg0 word (32 bytes) => 4 + 32 = 36 bytes => 72 hex chars (excluding 0x)
  if (calldata.length < 2 + 8 + 64) {
    return null;
  }
  const start = 2 + 8;
  const end = start + 64;
  return `0x${calldata.slice(start, end)}`;
}

const SELECTOR_LABELS: Readonly<Record<`0x${string}`, string>> = {
  "0x095ea7b3": "approve(address,uint256)",
  "0xa9059cbb": "transfer(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x39509351": "increaseAllowance(address,uint256)",
} as const;

function selectorLabel(selector: `0x${string}`): string {
  return SELECTOR_LABELS[selector] ?? selector;
}

function describeDelegationIntent(params: { chainId: number; intent: DelegationIntent }): string {
  const chainLabel = params.chainId === 42161 ? "Arbitrum (42161)" : `chainId=${params.chainId}`;
  const targets = params.intent.targets.join(", ");
  const selectors = params.intent.selectors.map(selectorLabel).join(", ");
  const pins =
    params.intent.allowedCalldata.length === 0
      ? "none"
      : params.intent.allowedCalldata
          .map((pin) => `byte[${pin.startIndex}]=${pin.value.slice(0, 18)}…`)
          .join(", ");
  return `${chainLabel}: targets=[${targets}] selectors=[${selectors}] pins=[${pins}]`;
}

function isMulticallLikeSelector(selector: `0x${string}`): boolean {
  return MULTICALL_LIKE_SELECTORS.has(selector);
}

function isHexData(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expandTransactionIfMulticall(params: {
  tx: Omit<NormalizedTransaction, "selector">;
  allowEmptyCalldata: boolean;
}): Array<Omit<NormalizedTransaction, "selector">> {
  const selector = deriveSelector(params.tx.data, { allowEmptyCalldata: params.allowEmptyCalldata });

  if (selector === MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray) {
    const decoded = decodeFunctionData({
      abi: UNISWAP_V3_STYLE_MULTICALL_ABI,
      data: params.tx.data,
    });
    if (decoded.functionName !== "multicall") {
      throw new Error(`Unexpected function decoded for selector ${selector}`);
    }

    const innerCallsUnknown: unknown = decoded.args[0];
    if (!Array.isArray(innerCallsUnknown) || innerCallsUnknown.length === 0) {
      throw new Error("multicall(bytes[]): expected non-empty bytes[]");
    }
    if (!innerCallsUnknown.every(isHexData)) {
      throw new Error("multicall(bytes[]): invalid bytes[] element");
    }
    const innerCalls = innerCallsUnknown as readonly `0x${string}`[];

    return innerCalls.map((callData) => ({
      ...params.tx,
      data: callData.toLowerCase() as `0x${string}`,
    }));
  }

  if (selector === MULTICALL_SELECTORS.squidFundAndRunMulticall) {
    const decoded = decodeFunctionData({
      abi: FUND_AND_RUN_MULTICALL_ABI,
      data: params.tx.data,
    });
    if (decoded.functionName !== "fundAndRunMulticall") {
      throw new Error(`Unexpected function decoded for selector ${selector}`);
    }

    const callsUnknown: unknown = decoded.args[2];
    if (!Array.isArray(callsUnknown) || callsUnknown.length === 0) {
      throw new Error("fundAndRunMulticall: expected non-empty calls[]");
    }

    return (callsUnknown as unknown[]).map((entry): Omit<NormalizedTransaction, "selector"> => {
      if (Array.isArray(entry)) {
        const target = entry[1] as unknown;
        const value = entry[2] as unknown;
        const callData = entry[3] as unknown;
        if (typeof target !== "string" || !isHexData(callData)) {
          throw new Error("fundAndRunMulticall: invalid tuple entry shape");
        }
        if (typeof value !== "bigint") {
          throw new Error("fundAndRunMulticall: expected bigint value in tuple entry");
        }
        return {
          ...params.tx,
          to: asLowercaseAddress(target),
          value,
          data: callData.toLowerCase() as `0x${string}`,
        };
      }

      if (isRecord(entry)) {
        const target = entry["target"];
        const value = entry["value"];
        const callData = entry["callData"];
        if (typeof target !== "string" || !isHexData(callData)) {
          throw new Error("fundAndRunMulticall: invalid object entry shape");
        }
        if (typeof value !== "bigint") {
          throw new Error("fundAndRunMulticall: expected bigint value in object entry");
        }
        return {
          ...params.tx,
          to: asLowercaseAddress(target),
          value,
          data: callData.toLowerCase() as `0x${string}`,
        };
      }

      throw new Error("fundAndRunMulticall: invalid calls[] entry (expected tuple or object)");
    });
  }

  if (isMulticallLikeSelector(selector)) {
    throw new Error(
      `Unsupported multicall selector encountered (${selector}). Refusing to derive one-time delegations from this tx plan.`,
    );
  }

  return [params.tx];
}

function normalizeAndValidateTransactions(
  transactions: readonly EmberEvmTransaction[],
  options: Required<
    Pick<
      DelegationGenerationOptions,
      "allowNonZeroValue" | "allowEmptyCalldata" | "enforceTargetAllowlist" | "targetAllowlist"
    >
  >,
): {
  chainId: number;
  normalizedTransactions: NormalizedTransaction[];
  selectorsByTarget: Map<`0x${string}`, Set<`0x${string}`>>;
  warnings: string[];
} {
  if (transactions.length === 0) {
    throw new Error("Invalid input: empty transaction list");
  }

  const chainId = parseChainId(transactions[0].chainId);
  const warnings: string[] = [];
  const allowlistSet = new Set(options.targetAllowlist.map((target) => target.toLowerCase()));

  const baseTransactions: Array<Omit<NormalizedTransaction, "selector">> = transactions.map(
    (transaction, index) => {
    const expectedChainId = parseChainId(transaction.chainId);
    if (expectedChainId !== chainId) {
      throw new Error(
        `Invalid input: mixed chain IDs (tx[0]=${chainId}, tx[${index}]=${expectedChainId})`,
      );
    }

      const value = parseValue(transaction.value);
      return {
        to: asLowercaseAddress(transaction.to),
        data: transaction.data.toLowerCase() as `0x${string}`,
        value,
        chainId,
      };
    },
  );

  const expanded: Array<Omit<NormalizedTransaction, "selector">> = [];
  for (const tx of baseTransactions) {
    expanded.push(
      ...expandTransactionIfMulticall({
        tx,
        allowEmptyCalldata: options.allowEmptyCalldata,
      }),
    );
  }

  const selectorsByTarget = new Map<`0x${string}`, Set<`0x${string}`>>();
  const normalizedTransactions: NormalizedTransaction[] = expanded.map((tx, index) => {
    if (tx.value !== 0n && !options.allowNonZeroValue) {
      throw new Error(
        `Non-zero value transaction rejected by policy (expandedTx[${index}] value=${tx.value.toString()})`,
      );
    }
    if (tx.value !== 0n && options.allowNonZeroValue) {
      warnings.push(
        `WARNING: non-zero value tx included (expandedTx[${index}] value=${tx.value.toString()})`,
      );
    }

    if (options.enforceTargetAllowlist && !allowlistSet.has(tx.to)) {
      throw new Error(`Target not in allowlist: ${tx.to}`);
    }

    const selector = deriveSelector(tx.data, { allowEmptyCalldata: options.allowEmptyCalldata });
    const selectorSet = selectorsByTarget.get(tx.to) ?? new Set<`0x${string}`>();
    selectorSet.add(selector);
    selectorsByTarget.set(tx.to, selectorSet);

    return {
      ...tx,
      selector,
    };
  });

  return { chainId, normalizedTransactions, selectorsByTarget, warnings };
}

function selectorsByTargetToDiagnostics(
  selectorsByTarget: Map<`0x${string}`, Set<`0x${string}`>>,
): SelectorDiagnostics[] {
  const targets = [...selectorsByTarget.keys()].sort((a, b) => a.localeCompare(b));
  return targets.map((target) => {
    const selectors = [...(selectorsByTarget.get(target) ?? new Set())].sort((a, b) =>
      a.localeCompare(b),
    );
    return {
      target,
      selectors,
    };
  });
}

function shouldConsolidate(
  diagnostics: readonly SelectorDiagnostics[],
  consolidation: DelegationGenerationOptions["consolidation"],
): boolean {
  if (consolidation === "perTarget") {
    return false;
  }
  if (consolidation === "single") {
    return true;
  }
  if (diagnostics.length <= 1) {
    return true;
  }
  const reference = diagnostics[0]?.selectors.join(",") ?? "";
  return diagnostics.every((entry) => entry.selectors.join(",") === reference);
}

export function normalizeEmberTransactionsForDelegations(params: {
  transactions: readonly EmberEvmTransaction[];
  options?: DelegationGenerationOptions;
}): NormalizationResult {
  const parsedTransactions = z.array(EmberEvmTransactionSchema).parse(params.transactions);
  const options: Required<
    Pick<
      DelegationGenerationOptions,
      "allowNonZeroValue" | "allowEmptyCalldata" | "enforceTargetAllowlist" | "targetAllowlist"
    >
  > = {
    allowNonZeroValue: params.options?.allowNonZeroValue ?? false,
    allowEmptyCalldata: params.options?.allowEmptyCalldata ?? false,
    enforceTargetAllowlist: params.options?.enforceTargetAllowlist ?? false,
    targetAllowlist: params.options?.targetAllowlist ?? [],
  };

  const { chainId, normalizedTransactions, selectorsByTarget, warnings } =
    normalizeAndValidateTransactions(parsedTransactions, options);
  const selectorDiagnostics = selectorsByTargetToDiagnostics(selectorsByTarget);
  return { chainId, normalizedTransactions, selectorDiagnostics, warnings };
}

export async function createSignedDelegationsForEmberTransactions(params: {
  transactions: readonly EmberEvmTransaction[];
  delegatorPrivateKey: `0x${string}`;
  delegatee: `0x${string}`;
  options?: DelegationGenerationOptions;
}): Promise<DelegationGenerationResult> {
  const options: Required<
    Pick<
      DelegationGenerationOptions,
      "allowNonZeroValue" | "allowEmptyCalldata" | "enforceTargetAllowlist" | "targetAllowlist"
    >
  > &
    Pick<DelegationGenerationOptions, "consolidation" | "environment"> = {
    allowNonZeroValue: params.options?.allowNonZeroValue ?? false,
    allowEmptyCalldata: params.options?.allowEmptyCalldata ?? false,
    enforceTargetAllowlist: params.options?.enforceTargetAllowlist ?? false,
    targetAllowlist: params.options?.targetAllowlist ?? [],
    consolidation: params.options?.consolidation ?? "auto",
    environment: params.options?.environment,
  };

  const { chainId, normalizedTransactions, selectorDiagnostics, warnings } =
    normalizeEmberTransactionsForDelegations({
      transactions: params.transactions,
      options,
    });
  const mutableWarnings: string[] = [...warnings];
  const environment = options.environment ?? getDeleGatorEnvironment(chainId);
  const delegatorAddress = privateKeyToAccount(params.delegatorPrivateKey).address.toLowerCase() as
    `0x${string}`;

  const delegations: Delegation[] = [];
  const delegationIntents: DelegationIntent[] = [];

  const delegatorWord = toAbiWordAddress(delegatorAddress);
  const txsByTargetSelector = new Map<string, NormalizedTransaction[]>();
  for (const tx of normalizedTransactions) {
    const approvalOrAllowanceSelectors = new Set<`0x${string}`>(["0x095ea7b3", "0x39509351"]);
    const maybeSpenderWord =
      approvalOrAllowanceSelectors.has(tx.selector) ? getFirstArgWord(tx.data) : null;
    const key = maybeSpenderWord
      ? `${tx.to}:${tx.selector}:${maybeSpenderWord}`
      : `${tx.to}:${tx.selector}`;
    const existing = txsByTargetSelector.get(key) ?? [];
    existing.push(tx);
    txsByTargetSelector.set(key, existing);
  }

  for (const [key, txs] of [...txsByTargetSelector.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const [target, selector] = key.split(":");
    if (!target || !selector) {
      continue;
    }

    const perTxPins = txs.map((tx) => findAbiWordOccurrences(tx.data, delegatorWord));
    const pinnedDelegatorOccurrences = intersectPins(perTxPins);

    const approvalSpenderPins: AllowedCalldataPin[] = [];
    if (selector === "0x095ea7b3" || selector === "0x39509351") {
      const spenderWord = key.split(":")[2] as `0x${string}` | undefined;
      if (spenderWord) {
        approvalSpenderPins.push({ startIndex: 4, value: spenderWord });
      }
    }

    const allowedCalldata = [...pinnedDelegatorOccurrences, ...approvalSpenderPins].sort(
      (a, b) => (a.startIndex - b.startIndex) || a.value.localeCompare(b.value),
    );

    delegationIntents.push({
      targets: [target as `0x${string}`],
      selectors: [selector as `0x${string}`],
      allowedCalldata,
    });
  }

  const anyPins = delegationIntents.some((intent) => intent.allowedCalldata.length > 0);
  const canUseLegacyConsolidation =
    !anyPins && shouldConsolidate(selectorDiagnostics, options.consolidation);

  if (canUseLegacyConsolidation) {
    const targets = selectorDiagnostics.map((entry) => entry.target);
    const selectors = [...new Set(selectorDiagnostics.flatMap((entry) => entry.selectors))].sort(
      (a, b) => a.localeCompare(b),
    );

    delegationIntents.length = 0;
    delegationIntents.push({ targets, selectors, allowedCalldata: [] });
  } else if (!anyPins && !canUseLegacyConsolidation) {
    // Legacy behavior for no-pin cases: split per target unless consolidation forced single.
    delegationIntents.length = 0;
    for (const entry of selectorDiagnostics) {
      delegationIntents.push({
        targets: [entry.target],
        selectors: [...entry.selectors],
        allowedCalldata: [],
      });
    }
  } else {
    mutableWarnings.push(
      "INFO: calldata pinning present; creating delegations per (target, selector[, spender]) group to avoid over-constraining unrelated calls.",
    );
  }

  const delegationDescriptions = delegationIntents.map((intent) =>
    describeDelegationIntent({ chainId, intent }),
  );

  for (const intent of delegationIntents) {
    const delegation = createDelegation({
      scope: {
        type: "functionCall",
        targets: [...intent.targets],
        selectors: [...intent.selectors],
        allowedCalldata: intent.allowedCalldata.map((pin) => ({
          startIndex: pin.startIndex,
          value: pin.value,
        })),
      },
      to: params.delegatee,
      from: delegatorAddress,
      environment,
    });

    const signature = await signDelegation({
      privateKey: params.delegatorPrivateKey,
      delegation,
      delegationManager: environment.DelegationManager,
      chainId,
    });

    delegations.push({ ...delegation, signature });
  }

  return {
    chainId,
    normalizedTransactions,
    selectorDiagnostics,
    delegations,
    delegationIntents,
    delegationDescriptions,
    warnings: mutableWarnings,
  };
}
