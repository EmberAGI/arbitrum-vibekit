import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  createSignedDelegationsForEmberTransactions,
  EmberEvmTransactionSchema,
  normalizeEmberTransactionsForDelegations,
} from "./delegations/emberDelegations.js";
import {
  readJsonFile,
  requestEmberSupplyTransactions,
  requestEmberSwapTransactions,
  requestEmberWithdrawTransactions,
} from "./ember/emberLiquidityClient.js";
import { EmberClmmIntentSchema, type EmberClmmIntent } from "./intent/clmmIntent.js";

const ArgsSchema = z.object({
  intentFile: z.string().optional(),
  txFile: z.string().optional(),
  outTxFile: z.string().optional(),
  emberBaseUrl: z.string().url().optional(),
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
    execute: (args["execute"] ?? process.env["DEMO_EXECUTE"]) === "true",
    rpcUrl: args["rpc-url"] ?? process.env["DEMO_RPC_URL"],
    delegateePrivateKey:
      args["delegatee-private-key"] ?? process.env["DEMO_DELEGATEE_PRIVATE_KEY"],
    delegatee: args["delegatee"] ?? process.env["DEMO_DELEGATEE_ADDRESS"],
    delegatorPrivateKey:
      args["delegator-private-key"] ?? process.env["DEMO_DELEGATOR_PRIVATE_KEY"],
  });
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

async function buildGroupsFromIntent(params: {
  baseUrl: string;
  intent: EmberClmmIntent;
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
      continue;
    }

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

  const groups = await (async (): Promise<TransactionGroup[]> => {
    const collected: TransactionGroup[] = [];

    if (intentFile) {
      const intent = await readJsonFile({ filePath: intentFile, schema: EmberClmmIntentSchema });
      collected.push(...(await buildGroupsFromIntent({ baseUrl, intent })));
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
        collected.push({
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

    if (collected.length === 0) {
      console.info(
        "demo/liquidity: provide --intent-file (recommended) and/or --tx-file for prebuilt tx plans.",
      );
      return [];
    }

    return collected;
  })();

  if (groups.length === 0) {
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

  const result = await createSignedDelegationsForEmberTransactions({
    transactions,
    delegatorPrivateKey: delegatorPrivateKey as `0x${string}`,
    delegatee: delegatee as `0x${string}`,
    options: {
      enforceTargetAllowlist: allowlist.length > 0,
      targetAllowlist: allowlist,
      allowNonZeroValue: (process.env["DEMO_ALLOW_NONZERO_VALUE"] ?? "false") === "true",
      allowEmptyCalldata: (process.env["DEMO_ALLOW_EMPTY_CALLDATA"] ?? "false") === "true",
    },
  });

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

  console.info(
    stringifyWithBigints(result),
  );
}

main().catch((error: unknown) => {
  console.error("demo/liquidity: fatal error", error);
  process.exitCode = 1;
});
