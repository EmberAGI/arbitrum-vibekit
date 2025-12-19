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

const SELECTOR_LABELS: Record<`0x${string}`, string> = {
  '0x095ea7b3': 'ERC20.approve',
  '0x04e45aaf': 'UniswapV3Router.exactInputSingle',
  [MULTICALL_SELECTORS.uniswapV3StyleMulticallBytesArray]: 'Multicall.multicall(bytes[])',
  [MULTICALL_SELECTORS.squidFundAndRunMulticall]: 'Squid.fundAndRunMulticall',
};

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
    const decoded = decodeFunctionData({
      abi: FUND_AND_RUN_MULTICALL_ABI,
      data: tx.data,
    });
    if (decoded.functionName !== 'fundAndRunMulticall') {
      return { expanded: [tx], warning: `Unexpected fundAndRunMulticall decode shape for selector=${tx.selector}` };
    }
    const callsArg = decoded.args?.[2];
    if (!Array.isArray(callsArg) || callsArg.length === 0) {
      return { expanded: [tx], warning: 'fundAndRunMulticall: empty calls array; leaving unexpanded' };
    }

    const expanded: NormalizedTransaction[] = [];
    for (const entry of callsArg) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('target' in entry) ||
        !('value' in entry) ||
        !('callData' in entry)
      ) {
        return { expanded: [tx], warning: 'fundAndRunMulticall: unexpected call entry shape; leaving unexpanded' };
      }
      const target = (entry as { target: unknown }).target;
      const value = (entry as { value: unknown }).value;
      const callData = (entry as { callData: unknown }).callData;

      if (typeof target !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(target)) {
        return { expanded: [tx], warning: 'fundAndRunMulticall: invalid target; leaving unexpanded' };
      }
      if (typeof callData !== 'string' || !/^0x[0-9a-fA-F]*$/u.test(callData)) {
        return { expanded: [tx], warning: 'fundAndRunMulticall: invalid callData; leaving unexpanded' };
      }
      if (typeof value !== 'bigint') {
        return { expanded: [tx], warning: 'fundAndRunMulticall: non-bigint value; leaving unexpanded' };
      }

      const data = callData.toLowerCase() as `0x${string}`;
      expanded.push({
        to: target.toLowerCase() as `0x${string}`,
        data,
        selector: deriveSelector(data),
        value,
        chainId: tx.chainId,
      });
    }
    return { expanded, warning: null };
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
        `WARNING: Transaction includes non-zero value (to=${tx.to}, selector=${deriveSelector(tx.data)}, value=${value.toString()}); value is not enforceable via function-call caveats.`,
      );
    }
    if (tx.data === '0x') {
      warnings.push(`WARNING: Transaction has empty calldata (to=${tx.to}); selector pinning may be ineffective.`);
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
      warnings.push(`WARNING: ${outcome.warning}`);
    }
    expanded.push(...outcome.expanded);
  }

  return {
    chainId,
    environment,
    normalizedTransactions: expanded,
    warnings,
  };
}

export function buildDelegationRequestBundle(params: {
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  transactions: readonly EmberEvmTransaction[];
}): DelegationRequestBundle {
  const normalization = normalizeAndExpandTransactions({ transactions: params.transactions });
  const environment: DeleGatorEnvironment = normalization.environment;

  const intentsMap = new Map<string, DelegationIntent>();
  for (const tx of normalization.normalizedTransactions) {
    const allowedCalldata = pinsForTransaction({ tx, delegatorAddress: params.delegatorAddress });
    const key = `${tx.to.toLowerCase()}:${tx.selector.toLowerCase()}:${pinKey(allowedCalldata)}`;
    if (!intentsMap.has(key)) {
      intentsMap.set(key, { target: tx.to, selector: tx.selector, allowedCalldata });
    }
  }

  const delegationIntents = [...intentsMap.values()];

  const delegationDescriptions = delegationIntents.map((intent) => {
    const label = SELECTOR_LABELS[intent.selector] ?? intent.selector;
    const pinSummary = intent.allowedCalldata.length > 0 ? ` (${intent.allowedCalldata.length} calldata pins)` : '';
    return `Allow ${label} on ${intent.target}${pinSummary}`;
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
