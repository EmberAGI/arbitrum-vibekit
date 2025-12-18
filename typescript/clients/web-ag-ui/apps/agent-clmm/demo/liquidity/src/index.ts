import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  createSignedDelegationsForEmberTransactions,
  EmberEvmTransactionSchema,
  type Erc20PeriodTransferCap,
  normalizeEmberTransactionsForDelegations,
} from "./delegations/emberDelegations.js";
import {
  readJsonFile,
  EmberApiRequestError,
  requestEmberSupplyTransactions,
  requestEmberSwapTransactions,
  requestEmberWithdrawTransactions,
  requestEmberWalletPositions,
} from "./ember/emberLiquidityClient.js";
import { EmberClmmIntentSchema } from "./intent/clmmIntent.js";

type ChainIdentifier = {
  chainId: string;
  address: `0x${string}`;
};

type EmberClmmIntent = {
  chainId: string;
  walletAddress: `0x${string}`;
  poolIdentifier: ChainIdentifier;
  range: { type: "full" } | { type: "limited"; minPrice: string; maxPrice: string };
  payableTokens: Array<{ tokenUid: ChainIdentifier; amount: string }>;
  actions: Array<
    | { type: "supply" }
    | { type: "withdraw" }
    | {
        type: "swap";
        amount: string;
        amountType: "exactIn" | "exactOut";
        fromTokenUid: ChainIdentifier;
        toTokenUid: ChainIdentifier;
      }
  >;
};

const ArgsSchema = z.object({
  intentFile: z.string().optional(),
  txFile: z.string().optional(),
  outTxFile: z.string().optional(),
  emberBaseUrl: z.string().url().optional(),
  skipSwaps: z.boolean().optional(),
  simulate: z.boolean().optional(),
  simulateCycles: z.string().optional(),
  execute: z.boolean().optional(),
  rpcUrl: z.string().url().optional(),
  delegateePrivateKey: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/u, "delegateePrivateKey must be a 32-byte hex key")
    .optional(),
  delegatee: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "delegatee must be an EVM address")
    .optional(),
  delegatorPrivateKey: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/u, "delegatorPrivateKey must be a 32-byte hex key")
    .optional(),
});

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }

  return ArgsSchema.parse({
    intentFile: args["intent-file"] ?? process.env["DEMO_INTENT_FILE"],
    txFile: args["tx-file"] ?? process.env["DEMO_TX_FILE"],
    outTxFile: args["out-tx-file"] ?? process.env["DEMO_OUT_TX_FILE"],
    emberBaseUrl: args["ember-base-url"] ?? process.env["EMBER_BASE_URL"],
    skipSwaps: (args["skip-swaps"] ?? process.env["DEMO_SKIP_SWAPS"]) === "true",
    simulate: (args["simulate"] ?? process.env["DEMO_SIMULATE"]) === "true",
    simulateCycles: args["simulate-cycles"] ?? process.env["DEMO_SIMULATE_CYCLES"],
    execute: (args["execute"] ?? process.env["DEMO_EXECUTE"]) === "true",
    rpcUrl: args["rpc-url"] ?? process.env["DEMO_RPC_URL"],
    delegateePrivateKey:
      args["delegatee-private-key"] ?? process.env["DEMO_DELEGATEE_PRIVATE_KEY"],
    delegatee: args["delegatee"] ?? process.env["DEMO_DELEGATEE_ADDRESS"],
    delegatorPrivateKey:
      args["delegator-private-key"] ?? process.env["DEMO_DELEGATOR_PRIVATE_KEY"],
  });
}

function parsePositiveInt(params: { label: string; value: string | undefined; defaultValue: number }): number {
  const raw = (params.value ?? "").trim();
  if (raw === "") {
    return params.defaultValue;
  }
  if (!/^\d+$/u.test(raw)) {
    throw new Error(`${params.label} must be a positive integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${params.label} must be a positive integer`);
  }
  return parsed;
}

function buildErc20PeriodTransferCapsFromIntent(intent: EmberClmmIntent): Erc20PeriodTransferCap[] {
  const multiplier = BigInt(process.env["DEMO_SPEND_CAP_MULTIPLIER"] ?? "6");
  if (multiplier <= 0n) {
    throw new Error("DEMO_SPEND_CAP_MULTIPLIER must be a positive integer");
  }

  const periodDuration = 3600;
  const now = Math.floor(Date.now() / 1000);
  const startDate = Math.floor(now / periodDuration) * periodDuration;

  const caps: Erc20PeriodTransferCap[] = [];
  const seen = new Set<string>();
  for (const payable of intent.payableTokens) {
    const tokenAddress = payable.tokenUid.address.toLowerCase() as `0x${string}`;
    const key = `${intent.chainId}:${tokenAddress}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    let amount: bigint;
    try {
      amount = BigInt(payable.amount);
    } catch {
      throw new Error(`Invalid payableTokens amount "${payable.amount}" (expected integer string)`);
    }
    if (amount <= 0n) {
      continue;
    }
    caps.push({
      tokenAddress,
      periodAmount: amount * multiplier,
      periodDuration,
      startDate,
    });
  }
  return caps;
}

const TransactionListSchema = z.union([
  z.array(EmberEvmTransactionSchema),
  z.object({
    transactions: z.array(EmberEvmTransactionSchema),
  }),
]);

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function stringifyWithBigints(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, inner: unknown) => (typeof inner === "bigint" ? inner.toString() : inner),
    2,
  );
}

type TransactionGroup = {
  label: string;
  transactions: readonly z.infer<typeof EmberEvmTransactionSchema>[];
};

function isKnownEmberSwapUpstream400Error(error: unknown): boolean {
  if (!(error instanceof EmberApiRequestError)) {
    return false;
  }

  // Ember `/swap` may surface upstream provider failures as HTTP 500 with an embedded Axios
  // error payload (status varies: 400 low-liquidity, 403 forbidden, etc).
  return (
    error.status === 500 &&
    error.url.endsWith("/swap") &&
    /AxiosError:\s*Request failed with status code \d{3}/i.test(error.bodyText)
  );
}

function isKnownEmberWithdrawUnsupportedError(error: unknown): boolean {
  if (!(error instanceof EmberApiRequestError)) {
    return false;
  }

  // Ember's `/liquidity/withdraw` expects an LP-token identifier; for Camelot CLMM this is
  // commonly not available as an ERC-20 token uid and the API currently responds 500.
  return (
    error.status === 500 &&
    /token id not found/i.test(error.bodyText)
  );
}

async function buildGroupsFromIntent(params: {
  baseUrl: string;
  intent: EmberClmmIntent;
  skipSwaps: boolean;
}): Promise<TransactionGroup[]> {
  const groups: TransactionGroup[] = [];

  for (let index = 0; index < params.intent.actions.length; index += 1) {
    const action = params.intent.actions[index];
    if (!action) {
      continue;
    }

    if (action.type === "supply") {
      const { transactions: txs } = await requestEmberSupplyTransactions({
        baseUrl: params.baseUrl,
        request: {
          walletAddress: params.intent.walletAddress,
          supplyChain: params.intent.chainId,
          poolIdentifier: params.intent.poolIdentifier,
          range: params.intent.range,
          payableTokens: params.intent.payableTokens,
        },
      });
      groups.push({
        label: `intent:action[${index}]:supply`,
        transactions: z.array(EmberEvmTransactionSchema).parse(txs),
      });
      continue;
    }

    if (action.type === "withdraw") {
      try {
        const { transactions: txs } = await requestEmberWithdrawTransactions({
          baseUrl: params.baseUrl,
          request: {
            walletAddress: params.intent.walletAddress,
            poolTokenUid: params.intent.poolIdentifier,
          },
        });
        groups.push({
          label: `intent:action[${index}]:withdraw`,
          transactions: z.array(EmberEvmTransactionSchema).parse(txs),
        });
      } catch (error: unknown) {
        if (isKnownEmberWithdrawUnsupportedError(error)) {
          const positions = await requestEmberWalletPositions({
            baseUrl: params.baseUrl,
            walletAddress: params.intent.walletAddress,
            chainId: params.intent.chainId,
          });
          const desiredPool = params.intent.poolIdentifier.address.toLowerCase();
          const resolved =
            positions.positions.find(
              (position) => position.poolIdentifier.address.toLowerCase() === desiredPool,
            )?.poolIdentifier ??
            (positions.positions.length === 1 ? positions.positions[0]?.poolIdentifier : undefined);

          if (!resolved) {
            console.warn(
              `demo/liquidity: skipping withdraw action[${index}] because Ember /liquidity/withdraw rejected the pool token uid (Token ID not found) and no fallback poolTokenUid could be resolved from /liquidity/positions. Provide a wallet with an existing position or pass a recorded withdraw tx plan via --tx-file.`,
            );
            continue;
          }

          try {
            const { transactions: txs } = await requestEmberWithdrawTransactions({
              baseUrl: params.baseUrl,
              request: {
                walletAddress: params.intent.walletAddress,
                poolTokenUid: resolved,
              },
            });
            groups.push({
              label: `intent:action[${index}]:withdraw`,
              transactions: z.array(EmberEvmTransactionSchema).parse(txs),
            });
            console.warn(
              `demo/liquidity: withdraw action[${index}] required fallback poolTokenUid resolution via /liquidity/positions (resolved=${resolved.address}). Consider updating your intent poolIdentifier to match Ember's identifier.`,
            );
            continue;
          } catch (retryError: unknown) {
            if (isKnownEmberWithdrawUnsupportedError(retryError)) {
              console.warn(
                `demo/liquidity: skipping withdraw action[${index}] because Ember /liquidity/withdraw rejected both the intent poolIdentifier and the resolved poolTokenUid (Token ID not found). Provide a different wallet/pool or pass a recorded withdraw tx plan via --tx-file.`,
              );
              continue;
            }
            throw retryError;
          }
        }
        throw error;
      }
      continue;
    }

    if (params.skipSwaps) {
      console.warn(
        `demo/liquidity: skipping swap action[${index}] because --skip-swaps / DEMO_SKIP_SWAPS is enabled.`,
      );
      continue;
    }

    try {
      const { transactions: txs } = await requestEmberSwapTransactions({
        baseUrl: params.baseUrl,
        request: {
          walletAddress: params.intent.walletAddress,
          amount: action.amount,
          amountType: action.amountType,
          fromTokenUid: action.fromTokenUid,
          toTokenUid: action.toTokenUid,
        },
      });
      groups.push({
        label: `intent:action[${index}]:swap`,
        transactions: z.array(EmberEvmTransactionSchema).parse(txs),
      });
    } catch (error: unknown) {
      if (isKnownEmberSwapUpstream400Error(error)) {
        console.warn(
          `demo/liquidity: skipping swap action[${index}] because Ember /swap is currently failing upstream (HTTP 500 with embedded Axios 400). As of 2025-12-18, this appears to be a service-side issue; remove swap actions from your intent or use a different swap planner.`,
        );
        continue;
      }
      throw error;
    }
  }

  return groups;
}

export async function main() {
  console.info("demo/liquidity: starting");
  console.info(
    "demo/liquidity: see README.md for setup, env vars, and the intent template.",
  );

  const {
    intentFile,
    txFile,
    outTxFile,
    emberBaseUrl,
    skipSwaps,
    simulate,
    simulateCycles,
    execute,
    rpcUrl,
    delegateePrivateKey,
    delegatee,
    delegatorPrivateKey,
  } = parseArgs(process.argv.slice(2));

  const baseUrl = emberBaseUrl ?? "https://api.emberai.xyz";

  if (!delegatee || !delegatorPrivateKey) {
    throw new Error(
      "Missing delegation identity inputs; provide --delegatee and --delegator-private-key (or DEMO_DELEGATEE_ADDRESS / DEMO_DELEGATOR_PRIVATE_KEY).",
    );
  }

  let resolvedIntent: EmberClmmIntent | null = null;
  const groups: TransactionGroup[] = [];

  if (intentFile) {
    const intent = (await readJsonFile({
      filePath: intentFile,
      schema: EmberClmmIntentSchema,
    })) as EmberClmmIntent;
    resolvedIntent = intent;
    groups.push(...(await buildGroupsFromIntent({ baseUrl, intent, skipSwaps: skipSwaps ?? false })));
  }

  const txFiles = (txFile ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const file of txFiles) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      const txsRaw = TransactionListSchema.parse(parsed);
      const txs = Array.isArray(txsRaw) ? txsRaw : txsRaw.transactions;
      groups.push({
        label: `tx-file:${file}`,
        transactions: z.array(EmberEvmTransactionSchema).parse(txs),
      });
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        console.info(
          `demo/liquidity: tx file not found at ${file}; continuing with other inputs (if provided).`,
        );
      } else {
        throw error;
      }
    }
  }

  if (groups.length === 0) {
    console.info(
      "demo/liquidity: provide --intent-file (recommended) and/or --tx-file for prebuilt tx plans.",
    );
    return;
  }

  const transactions = groups.flatMap((group) => group.transactions);

  if (outTxFile) {
    await writeFile(outTxFile, JSON.stringify({ transactions }, null, 2), "utf8");
    console.info(`demo/liquidity: wrote Ember transactions to ${outTxFile}`);
  }

  const allowlist = (process.env["DEMO_DELEGATION_TARGET_ALLOWLIST"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase() as `0x${string}`);

  const tokenAllowlist = resolvedIntent
    ? resolvedIntent.payableTokens.map((token) => token.tokenUid.address.toLowerCase() as `0x${string}`)
    : [];
  const enforceTokenAllowlist =
    resolvedIntent !== null && (process.env["DEMO_ENFORCE_TOKEN_ALLOWLIST"] ?? "true") === "true";
  const erc20PeriodTransferCaps = resolvedIntent ? buildErc20PeriodTransferCapsFromIntent(resolvedIntent) : [];

  const result = await createSignedDelegationsForEmberTransactions({
    transactions,
    delegatorPrivateKey: delegatorPrivateKey as `0x${string}`,
    delegatee: delegatee as `0x${string}`,
    options: {
      enforceTargetAllowlist: allowlist.length > 0,
      targetAllowlist: allowlist,
      allowNonZeroValue: (process.env["DEMO_ALLOW_NONZERO_VALUE"] ?? "false") === "true",
      allowEmptyCalldata: (process.env["DEMO_ALLOW_EMPTY_CALLDATA"] ?? "false") === "true",
      enforceTokenAllowlist,
      tokenAllowlist,
      erc20PeriodTransferCaps,
    },
  });

  console.info("demo/liquidity: delegation descriptions");
  for (const description of result.delegationDescriptions) {
    console.info(`- ${description}`);
  }

  if (simulate) {
    if (!resolvedIntent) {
      throw new Error("Simulation requires --intent-file / DEMO_INTENT_FILE");
    }
    const cycles = parsePositiveInt({ label: "simulateCycles", value: simulateCycles, defaultValue: 5 });
    const { validateNormalizedTransactionsAgainstDelegationIntents } = await import(
      "./simulation/rebalanceSimulation.js"
    );
    await validateNormalizedTransactionsAgainstDelegationIntents({
      baseUrl,
      intent: resolvedIntent,
      cycles,
      delegationIntents: result.delegationIntents,
      allowEmptyCalldata: (process.env["DEMO_ALLOW_EMPTY_CALLDATA"] ?? "false") === "true",
    });
  }

  if (execute) {
    if (!rpcUrl || !delegateePrivateKey) {
      throw new Error(
        "Execution requested but missing DEMO_RPC_URL / --rpc-url or DEMO_DELEGATEE_PRIVATE_KEY / --delegatee-private-key.",
      );
    }
    const { redeemDelegationsAndExecuteTransactions } = await import(
      "./execution/redeemAndExecute.js"
    );
    for (const group of groups) {
      const actionTransactions = group.transactions;
      const normalized = normalizeEmberTransactionsForDelegations({
        transactions: actionTransactions,
        options: {
          enforceTargetAllowlist: allowlist.length > 0,
          targetAllowlist: allowlist,
          allowNonZeroValue: (process.env["DEMO_ALLOW_NONZERO_VALUE"] ?? "false") === "true",
          allowEmptyCalldata: (process.env["DEMO_ALLOW_EMPTY_CALLDATA"] ?? "false") === "true",
        },
      });

      if (normalized.chainId !== result.chainId) {
        throw new Error(
          `Execution group chainId mismatch (${group.label} chainId=${normalized.chainId}, expected ${result.chainId})`,
        );
      }

      console.info(
        stringifyWithBigints({
          message: "demo/liquidity: executing onchain (intent-ordered batch)",
          group: group.label,
          chainId: result.chainId,
          delegatee,
          delegationDescriptions: result.delegationDescriptions,
          transactions: normalized.normalizedTransactions.map((tx) => ({
            to: tx.to,
            selector: tx.selector,
            value: tx.value,
            calldataBytes: Math.max(0, (tx.data.length - 2) / 2),
          })),
        }),
      );

      const execution = await redeemDelegationsAndExecuteTransactions({
        chainId: result.chainId,
        rpcUrl,
        delegateePrivateKey: delegateePrivateKey as `0x${string}`,
        delegations: result.delegations,
        transactions: normalized.normalizedTransactions,
      });
      console.info(`demo/liquidity: redeem+execute broadcast txHash=${execution.txHash}`);
      console.info(
        stringifyWithBigints({
          message: "demo/liquidity: redeem+execute receipt",
          group: group.label,
          status: execution.receipt.status,
          blockNumber: execution.receipt.blockNumber,
          transactionIndex: execution.receipt.transactionIndex,
          gasUsed: execution.receipt.gasUsed,
          effectiveGasPrice: execution.receipt.effectiveGasPrice,
          logs: execution.receipt.logs.length,
        }),
      );
    }
  }

  if ((process.env["DEMO_PRINT_RESULT_JSON"] ?? "false") === "true") {
    console.info(stringifyWithBigints(result));
  }
}

main().catch((error: unknown) => {
  console.error("demo/liquidity: fatal error", error);
  process.exitCode = 1;
});
