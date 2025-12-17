import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  createSignedDelegationsForEmberTransactions,
  EmberEvmTransactionSchema,
} from "./delegations/emberDelegations.js";
import {
  EmberSupplyRequestSchema,
  EmberWithdrawRequestSchema,
  readJsonFile,
  requestEmberSupplyTransactions,
  requestEmberWithdrawTransactions,
} from "./ember/emberLiquidityClient.js";

const ArgsSchema = z.object({
  txFile: z.string().optional(),
  outTxFile: z.string().optional(),
  emberBaseUrl: z.string().url().optional(),
  emberSupplyRequestFile: z.string().optional(),
  emberWithdrawRequestFile: z.string().optional(),
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
    txFile: args["tx-file"] ?? process.env["DEMO_TX_FILE"],
    outTxFile: args["out-tx-file"] ?? process.env["DEMO_OUT_TX_FILE"],
    emberBaseUrl: args["ember-base-url"] ?? process.env["EMBER_BASE_URL"],
    emberSupplyRequestFile:
      args["ember-supply-request-file"] ?? process.env["EMBER_SUPPLY_REQUEST_FILE"],
    emberWithdrawRequestFile:
      args["ember-withdraw-request-file"] ?? process.env["EMBER_WITHDRAW_REQUEST_FILE"],
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

export async function main() {
  console.info("demo/liquidity: starting");
  console.info(
    "demo/liquidity: see README.md for setup, env vars, and example request templates.",
  );

  const {
    txFile,
    outTxFile,
    emberBaseUrl,
    emberSupplyRequestFile,
    emberWithdrawRequestFile,
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

  const transactions = await (async () => {
    if (txFile) {
      const raw = await readFile(txFile, "utf8");
      const parsed: unknown = JSON.parse(raw);
      const txsRaw = TransactionListSchema.parse(parsed);
      return Array.isArray(txsRaw) ? txsRaw : txsRaw.transactions;
    }

    if (emberSupplyRequestFile) {
      const request = await readJsonFile({ filePath: emberSupplyRequestFile, schema: EmberSupplyRequestSchema });
      const { transactions: txs } = await requestEmberSupplyTransactions({ baseUrl, request });
      return txs;
    }

    if (emberWithdrawRequestFile) {
      const request = await readJsonFile({
        filePath: emberWithdrawRequestFile,
        schema: EmberWithdrawRequestSchema,
      });
      const { transactions: txs } = await requestEmberWithdrawTransactions({ baseUrl, request });
      return txs;
    }

    console.info(
      "demo/liquidity: provide one of --tx-file, --ember-supply-request-file, or --ember-withdraw-request-file.",
    );
    return null;
  })();

  if (!transactions) {
    return;
  }

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
    const txHash = await redeemDelegationsAndExecuteTransactions({
      chainId: result.chainId,
      rpcUrl,
      delegateePrivateKey: delegateePrivateKey as `0x${string}`,
      delegations: result.delegations,
      selectorDiagnostics: result.selectorDiagnostics,
      transactions: result.normalizedTransactions,
    });
    console.info(`demo/liquidity: redeem+execute broadcast txHash=${txHash}`);
  }

  console.info(
    JSON.stringify(
      result,
      (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("demo/liquidity: fatal error", error);
  process.exitCode = 1;
});
