import {
  createDelegation,
  getDeleGatorEnvironment,
  type DeleGatorEnvironment,
  type Delegation,
} from '@metamask/delegation-toolkit';
import { decodeFunctionData, erc20Abi, type Abi, type Hex } from 'viem';
import { z } from 'zod';

export const EmberEvmTransactionSchema = z.object({
  type: z.literal('EVM_TX'),
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, 'to must be an EVM address')
    .transform((value) => value.toLowerCase() as `0x${string}`),
  data: z
    .string()
    .regex(/^0x[0-9a-fA-F]*$/u, 'data must be 0x-prefixed hex')
    .transform((value) => value.toLowerCase() as `0x${string}`),
  value: z.string().optional(),
  chainId: z.string(),
});
export type EmberEvmTransaction = z.infer<typeof EmberEvmTransactionSchema>;

export type AllowedCalldataPin = {
  startIndex: number;
  value: `0x${string}`;
};

export type NormalizedTransaction = {
  to: `0x${string}`;
  data: `0x${string}`;
  selector: `0x${string}`;
  value: bigint;
  chainId: number;
};

export type DelegationIntent = {
  target: `0x${string}`;
  selector: `0x${string}`;
  allowedCalldata: readonly AllowedCalldataPin[];
  exampleCalldata?: `0x${string}`;
};

export type UnsignedDelegation = Omit<Delegation, 'signature'>;

export type DelegationRequestBundle = {
  chainId: number;
  environment: DeleGatorEnvironment;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  normalizedTransactions: readonly NormalizedTransaction[];
  delegationIntents: readonly DelegationIntent[];
  delegationsToSign: readonly UnsignedDelegation[];
  delegationDescriptions: readonly string[];
  warnings: readonly string[];
};

const MULTICALL_SELECTORS = {
  uniswapV3StyleMulticallBytesArray: '0xac9650d8',
  squidFundAndRunMulticall: '0x58181a80',
} as const;

const MULTICALL_LIKE_SELECTORS: ReadonlySet<`0x${string}`> = new Set([
  MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray,
  MULTICALL_SELECTORS.squidFundAndRunMulticall,
  // Common multicall variants we do not currently expand:
  '0x5ae401dc', // multicall(uint256,bytes[])
  '0x1f0464d1', // multicall(bytes32,bytes[])
]);

const UNISWAP_V3_STYLE_MULTICALL_ABI = [
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const satisfies Abi;

const FUND_AND_RUN_MULTICALL_ABI = [
  {
    type: 'function',
    name: 'fundAndRunMulticall',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'fundingToken', type: 'address' },
      { name: 'fundingAmount', type: 'uint256' },
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'callType', type: 'uint8' },
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'callData', type: 'bytes' },
          { name: 'extraData', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const satisfies Abi;

const UNISWAP_V3_ROUTER_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi;

const SELECTORS = {
  erc20Approve: '0x095ea7b3',
  uniswapV3ExactInputSingle: '0x04e45aaf',
  liquidityManagerDecreaseLiquidity: '0x0c49ccbe',
  liquidityManagerCollect: '0xfc6f7865',
  liquidityManagerBurn: '0x42966c68',
} as const satisfies Record<string, `0x${string}`>;

const KNOWN_ARBITRUM_TOKEN_LABELS: Record<`0x${string}`, string> = {
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'USDC',
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 'DAI',
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH',
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'WBTC',
};

function tokenLabel(params: { chainId: number; address: `0x${string}` }): string | null {
  const normalized = params.address.toLowerCase() as `0x${string}`;
  if (params.chainId === 42161) {
    return KNOWN_ARBITRUM_TOKEN_LABELS[normalized] ?? null;
  }
  return null;
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function formatNumberish(value: unknown): string | null {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export type NormalizedTransactionSummary = {
  index: number;
  to: `0x${string}`;
  selector: `0x${string}`;
  value: string;
  decoded?: {
    kind: 'erc20-approve' | 'uniswap-v3-exact-input-single';
    spender?: `0x${string}`;
    amount?: string;
    tokenIn?: `0x${string}`;
    tokenOut?: `0x${string}`;
    tokenInLabel?: string;
    tokenOutLabel?: string;
    recipient?: `0x${string}`;
    fee?: string;
    amountIn?: string;
    amountOutMinimum?: string;
    deadline?: string;
  };
};

export type FundAndRunMulticallFunding = {
  fundingToken: `0x${string}`;
  fundingAmount: bigint;
};

export function decodeFundAndRunMulticallFunding(
  data: `0x${string}`,
): FundAndRunMulticallFunding | null {
  if (data.slice(0, 10).toLowerCase() !== MULTICALL_SELECTORS.squidFundAndRunMulticall) {
    return null;
  }
  try {
    const decoded = decodeFunctionData({ abi: FUND_AND_RUN_MULTICALL_ABI, data });
    if (decoded.functionName !== 'fundAndRunMulticall') {
      return null;
    }
    const fundingToken = decoded.args?.[0];
    const fundingAmount = decoded.args?.[1];
    if (!isAddress(fundingToken) || typeof fundingAmount !== 'bigint') {
      return null;
    }
    return {
      fundingToken: fundingToken.toLowerCase() as `0x${string}`,
      fundingAmount,
    };
  } catch {
    return null;
  }
}

export function summarizeNormalizedTransactions(params: {
  chainId: number;
  transactions: readonly NormalizedTransaction[];
}): NormalizedTransactionSummary[] {
  return params.transactions.map((tx, index) => {
    const base: NormalizedTransactionSummary = {
      index,
      to: tx.to,
      selector: tx.selector,
      value: tx.value.toString(),
    };

    if (tx.selector === SELECTORS.erc20Approve) {
      try {
        const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
        if (decoded.functionName === 'approve') {
          const spender = decoded.args?.[0];
          const amount = decoded.args?.[1];
          base.decoded = {
            kind: 'erc20-approve',
            ...(isAddress(spender)
              ? { spender: spender.toLowerCase() as `0x${string}` }
              : {}),
            ...(formatNumberish(amount) ? { amount: formatNumberish(amount) ?? undefined } : {}),
          };
        }
      } catch {
        return base;
      }
    }

    if (tx.selector === SELECTORS.uniswapV3ExactInputSingle) {
      try {
        const decoded = decodeFunctionData({ abi: UNISWAP_V3_ROUTER_ABI, data: tx.data });
        if (decoded.functionName === 'exactInputSingle') {
          const paramsObject = decoded.args?.[0];
          if (typeof paramsObject === 'object' && paramsObject !== null) {
            const tuple = paramsObject as {
              tokenIn?: unknown;
              tokenOut?: unknown;
              fee?: unknown;
              recipient?: unknown;
              amountIn?: unknown;
              amountOutMinimum?: unknown;
              deadline?: unknown;
            };
            const tokenIn = isAddress(tuple.tokenIn)
              ? (tuple.tokenIn.toLowerCase() as `0x${string}`)
              : undefined;
            const tokenOut = isAddress(tuple.tokenOut)
              ? (tuple.tokenOut.toLowerCase() as `0x${string}`)
              : undefined;
            const recipient = isAddress(tuple.recipient)
              ? (tuple.recipient.toLowerCase() as `0x${string}`)
              : undefined;
            const tokenInLabel = tokenIn ? tokenLabel({ chainId: params.chainId, address: tokenIn }) : null;
            const tokenOutLabel = tokenOut ? tokenLabel({ chainId: params.chainId, address: tokenOut }) : null;
            base.decoded = {
              kind: 'uniswap-v3-exact-input-single',
              ...(tokenIn ? { tokenIn } : {}),
              ...(tokenOut ? { tokenOut } : {}),
              ...(tokenInLabel ? { tokenInLabel } : {}),
              ...(tokenOutLabel ? { tokenOutLabel } : {}),
              ...(recipient ? { recipient } : {}),
              ...(formatNumberish(tuple.fee) ? { fee: formatNumberish(tuple.fee) ?? undefined } : {}),
              ...(formatNumberish(tuple.amountIn)
                ? { amountIn: formatNumberish(tuple.amountIn) ?? undefined }
                : {}),
              ...(formatNumberish(tuple.amountOutMinimum)
                ? { amountOutMinimum: formatNumberish(tuple.amountOutMinimum) ?? undefined }
                : {}),
              ...(formatNumberish(tuple.deadline)
                ? { deadline: formatNumberish(tuple.deadline) ?? undefined }
                : {}),
            };
          }
        }
      } catch {
        return base;
      }
    }

    return base;
  });
}

function describeDelegationIntentForUser(params: { chainId: number; intent: DelegationIntent }): string {
  const selector = params.intent.selector.toLowerCase() as `0x${string}`;
  const target = params.intent.target.toLowerCase() as `0x${string}`;

  if (selector === SELECTORS.erc20Approve) {
    const label = tokenLabel({ chainId: params.chainId, address: target });
    return label
      ? `Let the app use your ${label} to complete your request.`
      : 'Let the app use one of your tokens to complete your request.';
  }

  if (selector === SELECTORS.uniswapV3ExactInputSingle) {
    const exampleCalldata = params.intent.exampleCalldata;
    if (exampleCalldata) {
      try {
        const decoded = decodeFunctionData({ abi: UNISWAP_V3_ROUTER_ABI, data: exampleCalldata });
        if (decoded.functionName === 'exactInputSingle') {
          const args = decoded.args?.[0];
          if (typeof args === 'object' && args !== null && 'tokenIn' in args && 'tokenOut' in args) {
            const tokenIn = (args as { tokenIn: unknown }).tokenIn;
            const tokenOut = (args as { tokenOut: unknown }).tokenOut;
            if (
              typeof tokenIn === 'string' &&
              /^0x[0-9a-fA-F]{40}$/u.test(tokenIn) &&
              typeof tokenOut === 'string' &&
              /^0x[0-9a-fA-F]{40}$/u.test(tokenOut)
            ) {
              const inLabel =
                tokenLabel({ chainId: params.chainId, address: tokenIn.toLowerCase() as `0x${string}` }) ?? 'a token';
              const outLabel =
                tokenLabel({ chainId: params.chainId, address: tokenOut.toLowerCase() as `0x${string}` }) ??
                'another token';
              return `Swap ${inLabel} for ${outLabel}.`;
            }
          }
        }
      } catch {
        // ignore and fall back to generic copy
      }
    }
    return 'Swap one token for another.';
  }

  if (selector === SELECTORS.liquidityManagerDecreaseLiquidity) {
    return 'Withdraw some of your funds from your liquidity position.';
  }
  if (selector === SELECTORS.liquidityManagerCollect) {
    return "Claim what's ready to claim from your liquidity position.";
  }
  if (selector === SELECTORS.liquidityManagerBurn) {
    return 'Close your liquidity position.';
  }

  if (
    selector === MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray ||
    selector === MULTICALL_SELECTORS.squidFundAndRunMulticall
  ) {
    return 'Complete a multi-step action as part of your request.';
  }

  return 'Complete a required step to manage your liquidity position.';
}

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
  const raw = (value ?? '0').trim();
  if (raw === '') {
    return 0n;
  }
  let parsed: bigint;
  try {
    parsed = BigInt(raw);
  } catch {
    throw new Error(`Invalid value "${value ?? ''}" (expected bigint-compatible string)`);
  }
  if (parsed < 0n) {
    throw new Error(`Invalid value "${value ?? ''}" (negative not allowed)`);
  }
  return parsed;
}

function deriveSelector(calldata: `0x${string}`): `0x${string}` {
  if (calldata === '0x') {
    return '0x00000000';
  }
  if (calldata.length < 10) {
    throw new Error(`Calldata too short to contain selector: "${calldata}"`);
  }
  return calldata.slice(0, 10) as `0x${string}`;
}

function toAbiWordAddress(address: `0x${string}`): `0x${string}` {
  const raw = address.toLowerCase().slice(2);
  return `0x${'0'.repeat(24)}${raw}` as `0x${string}`;
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

function uniqPins(pins: readonly AllowedCalldataPin[]): AllowedCalldataPin[] {
  const keyOf = (pin: AllowedCalldataPin) => `${pin.startIndex}:${pin.value.toLowerCase()}`;
  const seen = new Set<string>();
  const result: AllowedCalldataPin[] = [];
  for (const pin of pins) {
    const key = keyOf(pin);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(pin);
  }
  return result.sort((a, b) => (a.startIndex - b.startIndex) || a.value.localeCompare(b.value));
}

function pinKey(pins: readonly AllowedCalldataPin[]): string {
  return uniqPins(pins)
    .map((pin) => `${pin.startIndex}:${pin.value.toLowerCase()}`)
    .join('|');
}

function uniqStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function expandMulticallIfSupported(tx: NormalizedTransaction): {
  expanded: NormalizedTransaction[];
  warning: string | null;
} {
  if (!MULTICALL_LIKE_SELECTORS.has(tx.selector)) {
    return { expanded: [tx], warning: null };
  }

  if (tx.selector === MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray) {
    const decoded = decodeFunctionData({
      abi: UNISWAP_V3_STYLE_MULTICALL_ABI,
      data: tx.data,
    });
    if (decoded.functionName !== 'multicall') {
      return { expanded: [tx], warning: `Unexpected multicall decode shape for selector=${tx.selector}` };
    }
    const dataArg = decoded.args?.[0];
    if (!Array.isArray(dataArg) || dataArg.length === 0) {
      return { expanded: [tx], warning: 'multicall(bytes[]): empty calls array; leaving unexpanded' };
    }
    const expanded = dataArg.map((inner): NormalizedTransaction => ({
      to: tx.to,
      data: (typeof inner === 'string' ? inner : '0x') as `0x${string}`,
      selector: deriveSelector((typeof inner === 'string' ? inner : '0x') as `0x${string}`),
      value: 0n,
      chainId: tx.chainId,
    }));
    return { expanded, warning: null };
  }

  if (tx.selector === MULTICALL_SELECTORS.squidFundAndRunMulticall) {
    return {
      expanded: [tx],
      warning: 'fundAndRunMulticall: leaving unexpanded to preserve atomic routing semantics',
    };
  }

  return {
    expanded: [tx],
    warning: `Multicall-like selector ${tx.selector} not supported for expansion; delegations will be limited to target+selector.`,
  };
}

function pinsForTransaction(params: {
  tx: NormalizedTransaction;
  delegatorAddress: `0x${string}`;
}): AllowedCalldataPin[] {
  const pins: AllowedCalldataPin[] = [];

  const delegatorWord = toAbiWordAddress(params.delegatorAddress);
  pins.push(...findAbiWordOccurrences(params.tx.data, delegatorWord));

  if (params.tx.selector === '0x095ea7b3') {
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: params.tx.data });
      if (decoded.functionName === 'approve') {
        const spender = decoded.args?.[0];
        if (typeof spender === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(spender)) {
          pins.push(...findAbiWordOccurrences(params.tx.data, toAbiWordAddress(spender.toLowerCase() as `0x${string}`)));
        }
      }
    } catch {
      // ignore
    }
  }

  if (params.tx.selector === '0x04e45aaf') {
    try {
      const decoded = decodeFunctionData({ abi: UNISWAP_V3_ROUTER_ABI, data: params.tx.data });
      if (decoded.functionName === 'exactInputSingle') {
        const args = decoded.args?.[0];
        if (
          typeof args === 'object' &&
          args !== null &&
          'tokenIn' in args &&
          'tokenOut' in args &&
          'recipient' in args
        ) {
          const tokenIn = (args as { tokenIn: unknown }).tokenIn;
          const tokenOut = (args as { tokenOut: unknown }).tokenOut;
          const recipient = (args as { recipient: unknown }).recipient;
          for (const address of [tokenIn, tokenOut, recipient]) {
            if (typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(address)) {
              pins.push(
                ...findAbiWordOccurrences(
                  params.tx.data,
                  toAbiWordAddress(address.toLowerCase() as `0x${string}`),
                ),
              );
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return uniqPins(pins);
}

export function normalizeAndExpandTransactions(params: {
  transactions: readonly EmberEvmTransaction[];
}): {
  chainId: number;
  environment: DeleGatorEnvironment;
  normalizedTransactions: readonly NormalizedTransaction[];
  warnings: readonly string[];
} {
  const parsed = z.array(EmberEvmTransactionSchema).parse(params.transactions);

  if (parsed.length === 0) {
    throw new Error('No transactions provided for delegation generation');
  }

  const chainId = parseChainId(parsed[0].chainId);
  const environment = getDeleGatorEnvironment(chainId);
  const warnings: string[] = [];

  const normalized: NormalizedTransaction[] = parsed.map((tx): NormalizedTransaction => {
    const txChainId = parseChainId(tx.chainId);
    if (txChainId !== chainId) {
      throw new Error(`Mixed chainIds in tx plan (expected ${chainId}, got ${txChainId})`);
    }
    const value = parseValue(tx.value);
    if (value > 0n) {
      warnings.push(
        'One step includes sending extra network currency along with it. This kind of permission can’t strictly limit that part, so please review carefully.',
      );
    }
    if (tx.data === '0x') {
      warnings.push(
        'One step is missing some details, which can make the permission broader than intended. Please review carefully.',
      );
    }
    return {
      to: tx.to,
      data: tx.data,
      selector: deriveSelector(tx.data),
      value,
      chainId,
    };
  });

  const expanded: NormalizedTransaction[] = [];
  for (const tx of normalized) {
    const outcome = expandMulticallIfSupported(tx);
    if (outcome.warning) {
      warnings.push(
        'Some steps are bundled together in a way that can make permissions broader than expected. Please review carefully.',
      );
    }
    expanded.push(...outcome.expanded);
  }

  return {
    chainId,
    environment,
    normalizedTransactions: expanded,
    warnings: uniqStrings(warnings),
  };
}

export function buildDelegationRequestBundle(params: {
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  transactions: readonly EmberEvmTransaction[];
  extraIntents?: readonly DelegationIntent[];
}): DelegationRequestBundle {
  const normalization = normalizeAndExpandTransactions({ transactions: params.transactions });
  const environment: DeleGatorEnvironment = normalization.environment;

  const intentsMap = new Map<string, DelegationIntent>();
  for (const tx of normalization.normalizedTransactions) {
    const allowedCalldata = pinsForTransaction({ tx, delegatorAddress: params.delegatorAddress });
    const key = `${tx.to.toLowerCase()}:${tx.selector.toLowerCase()}:${pinKey(allowedCalldata)}`;
    if (!intentsMap.has(key)) {
      intentsMap.set(key, { target: tx.to, selector: tx.selector, allowedCalldata, exampleCalldata: tx.data });
    }
  }

  for (const intent of params.extraIntents ?? []) {
    const target = intent.target.toLowerCase() as `0x${string}`;
    const selector = intent.selector.toLowerCase() as `0x${string}`;
    const allowedCalldata = uniqPins(
      intent.allowedCalldata.map((pin) => ({
        startIndex: pin.startIndex,
        value: pin.value.toLowerCase() as `0x${string}`,
      })),
    );
    const key = `${target}:${selector}:${pinKey(allowedCalldata)}`;
    if (!intentsMap.has(key)) {
      intentsMap.set(key, { target, selector, allowedCalldata });
    }
  }

  const delegationIntents = [...intentsMap.values()];

  const delegationDescriptions = delegationIntents.map((intent) => {
    return describeDelegationIntentForUser({ chainId: normalization.chainId, intent });
  });

  const delegationsToSign: UnsignedDelegation[] = delegationIntents.map((intent) => {
    const delegation = createDelegation({
      scope: {
        type: 'functionCall',
        targets: [intent.target],
        selectors: [intent.selector],
        allowedCalldata: intent.allowedCalldata.map((pin) => ({
          startIndex: pin.startIndex,
          value: pin.value,
        })),
      },
      to: params.delegateeAddress,
      from: params.delegatorAddress,
      environment,
    });
    return {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      caveats: delegation.caveats,
      salt: delegation.salt,
    };
  });

  return {
    chainId: normalization.chainId,
    environment,
    delegatorAddress: params.delegatorAddress,
    delegateeAddress: params.delegateeAddress,
    normalizedTransactions: normalization.normalizedTransactions,
    delegationIntents,
    delegationsToSign,
    delegationDescriptions,
    warnings: normalization.warnings,
  };
}

function calldataMatchesPin(params: {
  calldata: `0x${string}`;
  pin: AllowedCalldataPin;
}): boolean {
  const start = 2 + params.pin.startIndex * 2;
  const end = start + (params.pin.value.length - 2);
  if (start < 2 || end > params.calldata.length) {
    return false;
  }
  const expected = params.pin.value.slice(2).toLowerCase();
  const actual = params.calldata.slice(start, end).toLowerCase();
  return actual === expected;
}

export function txMatchesDelegationIntent(tx: NormalizedTransaction, intent: DelegationIntent): boolean {
  if (tx.to.toLowerCase() !== intent.target.toLowerCase()) {
    return false;
  }
  if (tx.selector.toLowerCase() !== intent.selector.toLowerCase()) {
    return false;
  }
  for (const pin of intent.allowedCalldata) {
    if (!calldataMatchesPin({ calldata: tx.data, pin })) {
      return false;
    }
  }
  return true;
}

export function ensureHex(value: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/u.test(value)) {
    throw new Error(`Expected hex string, received "${value}"`);
  }
  return value.toLowerCase() as Hex;
}
