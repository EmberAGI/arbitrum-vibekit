import {
  createDelegation,
  getDeleGatorEnvironment,
  signDelegation,
  type DeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
import { decodeFunctionData, formatUnits, type Abi } from "viem";
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
  enforceTokenAllowlist?: boolean;
  tokenAllowlist?: readonly `0x${string}`[];
  erc20PeriodTransferCaps?: readonly Erc20PeriodTransferCap[];
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

export type Erc20PeriodTransferCap = {
  tokenAddress: `0x${string}`;
  periodAmount: bigint;
  periodDuration: number;
  startDate: number;
};

export type DelegationIntent = {
  targets: readonly `0x${string}`[];
  selectors: readonly `0x${string}`[];
  allowedCalldata: readonly AllowedCalldataPin[];
  exampleCalldata?: `0x${string}`;
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

function calldataContainsWord(calldata: `0x${string}`, word: `0x${string}`): boolean {
  return calldata.toLowerCase().includes(word.slice(2).toLowerCase());
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

function getWordAt(params: { calldata: `0x${string}`; startIndex: number }): `0x${string}` | null {
  const start = 2 + params.startIndex * 2;
  const end = start + 64;
  if (start < 2 || end > params.calldata.length) {
    return null;
  }
  return `0x${params.calldata.slice(start, end)}`;
}

const SELECTOR_LABELS: Readonly<Record<`0x${string}`, string>> = {
  "0x095ea7b3": "approve(address,uint256)",
  "0xa9059cbb": "transfer(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x39509351": "increaseAllowance(address,uint256)",
  "0x04e45aaf": "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
} as const;

function selectorLabel(selector: `0x${string}`): string {
  return SELECTOR_LABELS[selector] ?? selector;
}

function shortHex(value: `0x${string}`, options?: { start?: number; end?: number }): string {
  const start = options?.start ?? 6;
  const end = options?.end ?? 4;
  if (value.length <= 2 + start + end) {
    return value;
  }
  return `${value.slice(0, 2 + start)}…${value.slice(-end)}`;
}

function chainLabel(chainId: number): string {
  if (chainId === 42161) {
    return "Arbitrum";
  }
  return `chainId=${chainId}`;
}

type AddressLabel = { shortName: string; longName: string; decimals?: number };

const KNOWN_ADDRESSES: Readonly<
  Record<number, Readonly<Record<`0x${string}`, AddressLabel>>>
> = {
  42161: {
    // Tokens used by the demo intent template.
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { shortName: "WBTC", longName: "Wrapped Bitcoin", decimals: 8 },
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { shortName: "WETH", longName: "Wrapped Ether", decimals: 18 },
    // Router observed in Ember swap tx plans.
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { shortName: "Swap Router", longName: "Swap Router" },
    // Liquidity contract observed in Ember liquidity supply tx plans (protocol-specific).
    "0x00c7f3082833e796a5b3e4bd59f6642ff44dcd15": { shortName: "Liquidity Manager", longName: "Liquidity Manager" },
  },
} as const;

function labelForAddress(params: { chainId: number; address: `0x${string}` }): AddressLabel | null {
  return KNOWN_ADDRESSES[params.chainId]?.[params.address.toLowerCase() as `0x${string}`] ?? null;
}

function formatEntity(params: { chainId: number; address: `0x${string}`; showHex: boolean }): string {
  const label = labelForAddress({ chainId: params.chainId, address: params.address });
  if (!label) {
    return params.showHex ? shortHex(params.address) : "a specific contract";
  }
  return params.showHex ? `${label.shortName} (${shortHex(params.address)})` : label.shortName;
}

function formatCapRateUnit(periodDurationSeconds: number): string {
  if (periodDurationSeconds === 3600) {
    return "hour";
  }
  if (periodDurationSeconds === 86400) {
    return "day";
  }
  if (periodDurationSeconds === 60) {
    return "minute";
  }
  return `${periodDurationSeconds}s`;
}

function formatTokenAmountForCaps(params: {
  chainId: number;
  tokenAddress: `0x${string}`;
  amount: bigint;
}): string {
  const label = labelForAddress({ chainId: params.chainId, address: params.tokenAddress });
  const decimals = label?.decimals;
  if (typeof decimals !== "number") {
    return params.amount.toString();
  }
  return formatUnits(params.amount, decimals);
}

function tryParseAbiWordAddress(word: `0x${string}`): `0x${string}` | null {
  const normalized = word.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    return null;
  }
  const raw = normalized.slice(2);
  if (!raw.startsWith("0".repeat(24))) {
    return null;
  }
  const address = `0x${raw.slice(24)}` as const;
  return /^0x[0-9a-f]{40}$/u.test(address) ? address : null;
}

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
] as const satisfies Abi;

const UNISWAP_V3_EXACT_INPUT_SINGLE_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const satisfies Abi;

const ERC20_TRANSFER_SELECTORS: ReadonlySet<`0x${string}`> = new Set([
  "0xa9059cbb", // transfer(address,uint256)
  "0x23b872dd", // transferFrom(address,address,uint256)
]);

function getErc20PeriodTransferCapsForIntent(params: {
  intent: DelegationIntent;
  caps: readonly Erc20PeriodTransferCap[];
}): Erc20PeriodTransferCap[] {
  if (params.caps.length === 0) {
    return [];
  }
  if (params.intent.targets.length !== 1 || params.intent.selectors.length !== 1) {
    return [];
  }
  const target = params.intent.targets[0]?.toLowerCase() as `0x${string}` | undefined;
  const selector = params.intent.selectors[0];
  if (!target || !selector) {
    return [];
  }
  if (!ERC20_TRANSFER_SELECTORS.has(selector)) {
    return [];
  }
  return params.caps.filter((cap) => cap.tokenAddress.toLowerCase() === target);
}

function describeDelegationIntent(params: {
  chainId: number;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  intent: DelegationIntent;
  showHex: boolean;
  erc20PeriodTransferCaps: readonly Erc20PeriodTransferCap[];
}): string {
  const network = chainLabel(params.chainId);

  const targets = [...params.intent.targets];
  const selectors = [...params.intent.selectors];
  const allowedCalldata = [...params.intent.allowedCalldata];
  const caps = [...params.erc20PeriodTransferCaps];

  if (targets.length === 1 && selectors.length === 1) {
    const target = targets[0] ?? ("0x" as `0x${string}`);
    const selector = selectors[0] ?? ("0x00000000" as `0x${string}`);

    const spenderPinned =
      (selector === "0x095ea7b3" || selector === "0x39509351") &&
      allowedCalldata.some((pin) => pin.startIndex === 4);

    const spender = spenderPinned
      ? tryParseAbiWordAddress(
          allowedCalldata.find((pin) => pin.startIndex === 4)?.value ??
            "0x0000000000000000000000000000000000000000000000000000000000000000",
        )
      : null;

    const delegatorWord = toAbiWordAddress(params.delegatorAddress);
    const delegatorPins = allowedCalldata
      .filter((pin) => pin.value.toLowerCase() === delegatorWord.toLowerCase())
      .map((pin) => pin.startIndex)
      .sort((a, b) => a - b);

    const detailsParts: string[] = [];
    if (params.showHex) {
      detailsParts.push(`target=${shortHex(target)}`);
      detailsParts.push(`selector=${selectorLabel(selector)}`);
      detailsParts.push(`agent=${shortHex(params.delegateeAddress)}`);
    }
    if (spender && params.showHex) {
      detailsParts.push(`spender=${shortHex(spender)}`);
    }
    const details = detailsParts.length > 0 ? ` (${detailsParts.join(", ")})` : "";
    const capText =
      caps.length > 0
        ? ` Spending caps: ${caps
            .map((cap) => {
              const tokenName = formatEntity({ chainId: params.chainId, address: cap.tokenAddress, showHex: params.showHex });
              const amountText = formatTokenAmountForCaps({
                chainId: params.chainId,
                tokenAddress: cap.tokenAddress,
                amount: cap.periodAmount,
              });
              const unit = formatCapRateUnit(cap.periodDuration);
              return `${amountText} ${tokenName}/${unit}`;
            })
            .join(", ")}.`
        : "";

    if (selector === "0x095ea7b3" || selector === "0x39509351") {
      const tokenName = formatEntity({ chainId: params.chainId, address: target, showHex: params.showHex });
      let decodedSpender: `0x${string}` | null = null;
      if (params.intent.exampleCalldata) {
        try {
          const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: params.intent.exampleCalldata });
          if (decoded.functionName === "approve") {
            const maybeSpender = decoded.args[0] as unknown;
            if (typeof maybeSpender === "string") {
              decodedSpender = maybeSpender.toLowerCase() as `0x${string}`;
            }
          }
        } catch {
          // Best-effort decode for UX; ignore failures.
        }
      }

      const spenderName = (spender ?? decodedSpender)
        ? formatEntity({
            chainId: params.chainId,
            address: (spender ?? decodedSpender ?? "0x0000000000000000000000000000000000000000"),
            showHex: params.showHex,
          })
        : "a specific contract";

      const onlySpender =
        spenderName === "a specific contract"
          ? "Only the approved swap service can use this permission."
          : `Only ${spenderName} can use this permission.`;
      return `${network}: Let your agent set up swapping by giving ${spenderName} access to your ${tokenName}. ${onlySpender}${capText}${details}`;
    }

    if (selector === "0x04e45aaf" && params.intent.exampleCalldata) {
      try {
        const decoded = decodeFunctionData({
          abi: UNISWAP_V3_EXACT_INPUT_SINGLE_ABI,
          data: params.intent.exampleCalldata,
        });
        if (decoded.functionName === "exactInputSingle") {
          const arg0 = decoded.args[0] as unknown;
          const tuple = Array.isArray(arg0) ? arg0 : null;
          const object = isRecord(arg0) ? arg0 : null;
          const tokenIn = (tuple?.[0] as unknown) ?? object?.["tokenIn"] ?? null;
          const tokenOut = (tuple?.[1] as unknown) ?? object?.["tokenOut"] ?? null;
          const recipient = (tuple?.[3] as unknown) ?? object?.["recipient"] ?? null;

          if (
            typeof tokenIn === "string" &&
            typeof tokenOut === "string" &&
            typeof recipient === "string"
          ) {
            const fromToken = formatEntity({
              chainId: params.chainId,
              address: tokenIn.toLowerCase() as `0x${string}`,
              showHex: params.showHex,
            });
            const toToken = formatEntity({
              chainId: params.chainId,
              address: tokenOut.toLowerCase() as `0x${string}`,
              showHex: params.showHex,
            });
            const routerName = formatEntity({
              chainId: params.chainId,
              address: target,
              showHex: params.showHex,
            });
            const recipientIsYou = recipient.toLowerCase() === params.delegatorAddress.toLowerCase();
            const recipientText =
              recipientIsYou && delegatorPins.length > 0
                ? "and always send the result back to you"
                : recipientIsYou
                  ? "and send the result back to you"
                  : "and send the result to a specific address";

            const constraints = `Only your agent can do this, and it can only use ${routerName}.`;
            return `${network}: Let your agent swap tokens using ${routerName}. In this plan it swaps ${fromToken} to ${toToken}, ${recipientText}. ${constraints}${capText}${details}`;
          }
        }
      } catch {
        // Best-effort decode for UX; fall through to generic text.
      }
    }

    const targetName = formatEntity({ chainId: params.chainId, address: target, showHex: params.showHex });
    const tokenSymbols =
      params.intent.exampleCalldata
        ? Object.entries(KNOWN_ADDRESSES[params.chainId] ?? {})
            .filter(([, label]) => !["Swap Router", "Liquidity Manager"].includes(label.shortName))
            .filter(([address]) =>
              calldataContainsWord(
                params.intent.exampleCalldata as `0x${string}`,
                toAbiWordAddress(address as `0x${string}`),
              ),
            )
            .map(([, label]) => label.shortName)
        : [];

    const tokenSuffix =
      tokenSymbols.length >= 2 ? ` for your ${tokenSymbols.slice(0, 2).join("/")} position` : " for your position";
    const receiverConstraint =
      delegatorPins.length > 0 ? " It must return any funds back to you." : "";
    return `${network}: Let your agent manage liquidity${tokenSuffix} using ${targetName}.${receiverConstraint} Only your agent can do this.${capText}${details}`;
  }

  const targetsText = targets
    .map((address) => formatEntity({ chainId: params.chainId, address, showHex: params.showHex }))
    .join(", ");
  const selectorsText = selectors.map(selectorLabel).join(", ");
  const capText =
    caps.length > 0
      ? ` Spending caps: ${caps
          .map((cap) => {
            const tokenName = formatEntity({ chainId: params.chainId, address: cap.tokenAddress, showHex: params.showHex });
            const amountText = formatTokenAmountForCaps({
              chainId: params.chainId,
              tokenAddress: cap.tokenAddress,
              amount: cap.periodAmount,
            });
            const unit = formatCapRateUnit(cap.periodDuration);
            return `${amountText} ${tokenName}/${unit}`;
          })
          .join(", ")}.`
      : "";
  return `${network}: Let your agent use ${targetsText} for a limited set of actions (${selectorsText}).${capText}`;
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
  const options = {
    allowNonZeroValue: params.options?.allowNonZeroValue ?? false,
    allowEmptyCalldata: params.options?.allowEmptyCalldata ?? false,
    enforceTargetAllowlist: params.options?.enforceTargetAllowlist ?? false,
    targetAllowlist: params.options?.targetAllowlist ?? [],
    consolidation: params.options?.consolidation ?? "auto",
    environment: params.options?.environment,
    enforceTokenAllowlist: params.options?.enforceTokenAllowlist ?? false,
    tokenAllowlist: params.options?.tokenAllowlist ?? [],
    erc20PeriodTransferCaps: params.options?.erc20PeriodTransferCaps ?? [],
  } satisfies Required<
    Pick<
      DelegationGenerationOptions,
      | "allowNonZeroValue"
      | "allowEmptyCalldata"
      | "enforceTargetAllowlist"
      | "targetAllowlist"
      | "enforceTokenAllowlist"
      | "tokenAllowlist"
      | "erc20PeriodTransferCaps"
    >
  > &
    Pick<DelegationGenerationOptions, "consolidation" | "environment">;

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
  const tokenAllowlistSet = new Set(options.tokenAllowlist.map((token) => token.toLowerCase()));

  type TxGroup = {
    target: `0x${string}`;
    selector: `0x${string}`;
    extraPins: AllowedCalldataPin[];
    txs: NormalizedTransaction[];
  };

  const groupsByKey = new Map<string, TxGroup>();
  for (const tx of normalizedTransactions) {
    const keyParts: string[] = [tx.to, tx.selector];
    const extraPins: AllowedCalldataPin[] = [];

    if (tx.selector === "0x095ea7b3" || tx.selector === "0x39509351") {
      const spenderWord = getFirstArgWord(tx.data);
      if (!spenderWord) {
        throw new Error(`Unable to parse spender word for approval tx (selector=${tx.selector})`);
      }
      keyParts.push(`spender=${spenderWord}`);
      extraPins.push({ startIndex: 4, value: spenderWord });
    } else if (tx.selector === "0x04e45aaf") {
      if (options.enforceTokenAllowlist && tokenAllowlistSet.size === 0) {
        throw new Error("enforceTokenAllowlist enabled, but tokenAllowlist is empty");
      }

      const tokenInWord = getWordAt({ calldata: tx.data, startIndex: 4 });
      const tokenOutWord = getWordAt({ calldata: tx.data, startIndex: 36 });
      if (!tokenInWord || !tokenOutWord) {
        throw new Error("exactInputSingle: expected tokenIn/tokenOut words");
      }

      const tokenIn = tryParseAbiWordAddress(tokenInWord);
      const tokenOut = tryParseAbiWordAddress(tokenOutWord);
      if (!tokenIn || !tokenOut) {
        throw new Error("exactInputSingle: tokenIn/tokenOut were not ABI-word addresses");
      }

      if (options.enforceTokenAllowlist) {
        if (!tokenAllowlistSet.has(tokenIn.toLowerCase()) || !tokenAllowlistSet.has(tokenOut.toLowerCase())) {
          throw new Error(
            `Swap token pair not in allowlist (tokenIn=${tokenIn}, tokenOut=${tokenOut}). Refusing to build long-lived delegations.`,
          );
        }
      }

      keyParts.push(`tokenIn=${tokenInWord}`, `tokenOut=${tokenOutWord}`);
      extraPins.push({ startIndex: 4, value: tokenInWord });
      extraPins.push({ startIndex: 36, value: tokenOutWord });
    } else if (tokenAllowlistSet.size > 0) {
      const token0Word = getWordAt({ calldata: tx.data, startIndex: 4 });
      const token1Word = getWordAt({ calldata: tx.data, startIndex: 36 });
      if (token0Word && token1Word) {
        const token0 = tryParseAbiWordAddress(token0Word);
        const token1 = tryParseAbiWordAddress(token1Word);
        if (
          token0 &&
          token1 &&
          tokenAllowlistSet.has(token0.toLowerCase()) &&
          tokenAllowlistSet.has(token1.toLowerCase())
        ) {
          keyParts.push(`token0=${token0Word}`, `token1=${token1Word}`);
          extraPins.push({ startIndex: 4, value: token0Word });
          extraPins.push({ startIndex: 36, value: token1Word });
        }
      }
    }

    const key = keyParts.join("|");
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.txs.push(tx);
      continue;
    }
    groupsByKey.set(key, {
      target: tx.to,
      selector: tx.selector,
      extraPins,
      txs: [tx],
    });
  }

  for (const key of [...groupsByKey.keys()].sort((a, b) => a.localeCompare(b))) {
    const group = groupsByKey.get(key);
    if (!group) {
      continue;
    }

    const exampleCalldata = group.txs[0]?.data;
    const perTxPins = group.txs.map((tx) => findAbiWordOccurrences(tx.data, delegatorWord));
    const pinnedDelegatorOccurrences = intersectPins(perTxPins);
    const allowedCalldata = [...pinnedDelegatorOccurrences, ...group.extraPins].sort(
      (a, b) => (a.startIndex - b.startIndex) || a.value.localeCompare(b.value),
    );

    delegationIntents.push({
      targets: [group.target],
      selectors: [group.selector],
      allowedCalldata,
      exampleCalldata,
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

  const showHex = (process.env["DEMO_SHOW_HEX_DETAILS"] ?? "false") === "true";
  const delegationDescriptions = delegationIntents.map((intent) => {
    const capsForIntent = getErc20PeriodTransferCapsForIntent({
      intent,
      caps: options.erc20PeriodTransferCaps,
    });

    return describeDelegationIntent({
      chainId,
      delegatorAddress,
      delegateeAddress: params.delegatee,
      intent,
      showHex,
      erc20PeriodTransferCaps: capsForIntent,
    });
  });

  let appliedAnyErc20PeriodTransfer = false;
  for (const intent of delegationIntents) {
    const capsForIntent = getErc20PeriodTransferCapsForIntent({
      intent,
      caps: options.erc20PeriodTransferCaps,
    });
    const caveats =
      capsForIntent.length > 0
        ? capsForIntent.map((cap) => ({
            type: "erc20PeriodTransfer" as const,
            tokenAddress: cap.tokenAddress,
            periodAmount: cap.periodAmount,
            periodDuration: cap.periodDuration,
            startDate: cap.startDate,
          }))
        : undefined;
    if (caveats) {
      appliedAnyErc20PeriodTransfer = true;
    }

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
      caveats,
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

  if (options.erc20PeriodTransferCaps.length > 0 && !appliedAnyErc20PeriodTransfer) {
    mutableWarnings.push(
      "INFO: spend caps configured, but no delegation directly calls ERC-20 transfer/transferFrom; skipping ERC20PeriodTransfer caveats for this plan.",
    );
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
