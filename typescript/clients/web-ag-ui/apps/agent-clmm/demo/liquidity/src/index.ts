import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import {
  createSignedDelegationsForEmberTransactions,
  EmberEvmTransactionSchema,
  type Erc20PeriodTransferCap,
} from "./delegations/emberDelegations.js";
import {
  readJsonFile,
  EmberApiRequestError,
  requestEmberSupplyTransactions,
  requestEmberSwapTransactions,
  requestEmberWithdrawTransactions,
  requestEmberWalletPositions,
} from "./ember/emberLiquidityClient.js";
import { EmberClmmIntentSchema, type EmberClmmIntent } from "./intent/clmmIntent.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ERC20_APPROVE_SELECTOR = "0x095ea7b3" as const;
const UINT256_MAX =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const satisfies `0x${string}`;

function getWordAt(params: { calldata: `0x${string}`; startIndex: number }): `0x${string}` | null {
  const start = 2 + params.startIndex * 2;
  const end = start + 64;
  if (start < 2 || end > params.calldata.length) {
    return null;
  }
  return `0x${params.calldata.slice(start, end)}`;
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

function encodeErc20ApproveCalldata(params: { spender: `0x${string}`; amount: `0x${string}` }): `0x${string}` {
  const spenderWord = `0x${"0".repeat(24)}${params.spender.toLowerCase().slice(2)}` as const;
  const amountWord = params.amount.toLowerCase().slice(2).padStart(64, "0");
  return `${ERC20_APPROVE_SELECTOR}${spenderWord.slice(2)}${amountWord}`.toLowerCase() as `0x${string}`;
}

function truncateText(params: { value: string; maxChars: number }): string {
  const raw = params.value.trim();
  if (raw.length <= params.maxChars) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, params.maxChars - 3))}...`;
}

function tryExtractPoolAddressFromProviderId(providerId: string | null): `0x${string}` | null {
  if (!providerId) {
    return null;
  }
  const match = providerId.match(/_?(0x[0-9a-fA-F]{40})_?/u);
  if (!match?.[1]) {
    return null;
  }
  return match[1].toLowerCase() as `0x${string}`;
}

function maybeInjectLiquidityManagerApprovals(params: { groups: TransactionGroup[] }): void {
  const enabled = (process.env["DEMO_INJECT_LIQUIDITY_APPROVALS"] ?? "true") === "true";
  if (!enabled) {
    return;
  }

  for (const group of params.groups) {
    const supplyLike = group.label.includes(":supply") || group.label.includes(":rebalance");
    if (!supplyLike) {
      continue;
    }

    const mintTx = group.transactions.find(
      (tx) => tx.type === "EVM_TX" && typeof tx.data === "string" && tx.data.length >= 10,
    );
    if (!mintTx) {
      continue;
    }

    const spender = mintTx.to.toLowerCase() as `0x${string}`;
    const token0Word = getWordAt({ calldata: mintTx.data, startIndex: 4 });
    const token1Word = getWordAt({ calldata: mintTx.data, startIndex: 36 });
    if (!token0Word || !token1Word) {
      continue;
    }

    const token0 = tryParseAbiWordAddress(token0Word);
    const token1 = tryParseAbiWordAddress(token1Word);
    if (!token0 || !token1) {
      continue;
    }

    const spenderWord = `0x${"0".repeat(24)}${spender.toLowerCase().slice(2)}`.toLowerCase();
    const alreadyHasApproval = (token: `0x${string}`) =>
      group.transactions.some((tx) => {
        if (tx.type !== "EVM_TX") {
          return false;
        }
        if (tx.to.toLowerCase() !== token.toLowerCase()) {
          return false;
        }
        if (!tx.data.toLowerCase().startsWith(ERC20_APPROVE_SELECTOR)) {
          return false;
        }
        const word = getWordAt({ calldata: tx.data, startIndex: 4 });
        return word?.toLowerCase() === spenderWord;
      });

    const approvals: Array<z.infer<typeof EmberEvmTransactionSchema>> = [];
    for (const token of [token0, token1]) {
      if (alreadyHasApproval(token)) {
        continue;
      }
      approvals.push({
        type: "EVM_TX",
        to: token,
        data: encodeErc20ApproveCalldata({ spender, amount: UINT256_MAX }),
        value: "0",
        chainId: mintTx.chainId,
      });
    }

    if (approvals.length > 0) {
      group.transactions.unshift(...approvals);
      console.warn(
        `demo/liquidity: injected ${approvals.length} ERC20 approvals for Liquidity Manager spender=${spender} into ${group.label} (disable via DEMO_INJECT_LIQUIDITY_APPROVALS=false).`,
      );
    }
  }
}

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
    .transform((value) => value.toLowerCase() as `0x${string}`)
    .optional(),
  delegatee: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, "delegatee must be an EVM address")
    .transform((value) => value.toLowerCase() as `0x${string}`)
    .optional(),
  delegatorPrivateKey: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/u, "delegatorPrivateKey must be a 32-byte hex key")
    .transform((value) => value.toLowerCase() as `0x${string}`)
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
  transactions: z.infer<typeof EmberEvmTransactionSchema>[];
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
  return error.status === 500 && /token id not found/i.test(error.bodyText);
}

async function buildGroupsFromIntent(params: {
  baseUrl: string;
  intent: EmberClmmIntent;
  skipSwaps: boolean;
  onlyActionIndex?: number;
}): Promise<TransactionGroup[]> {
  const groups: TransactionGroup[] = [];
  let lastSupplyPoolTokenUid: EmberClmmIntent["poolIdentifier"] | null = null;

  for (let index = 0; index < params.intent.actions.length; index += 1) {
    if (typeof params.onlyActionIndex === "number" && index !== params.onlyActionIndex) {
      continue;
    }

    const action = params.intent.actions[index];
    if (!action) {
      continue;
    }

    if (action.type === "supply") {
      const { response, transactions: txs } = await requestEmberSupplyTransactions({
        baseUrl: params.baseUrl,
        request: {
          walletAddress: params.intent.walletAddress,
          supplyChain: params.intent.chainId,
          poolIdentifier: params.intent.poolIdentifier,
          range: params.intent.range,
          payableTokens: params.intent.payableTokens,
        },
      });
      lastSupplyPoolTokenUid = response.poolIdentifier ?? lastSupplyPoolTokenUid;
      groups.push({
        label: `intent:action[${index}]:supply`,
        transactions: z.array(EmberEvmTransactionSchema).parse(txs),
      });
      continue;
    }

    if (action.type === "withdraw") {
      const preferredPoolTokenUid =
        params.intent.poolTokenUid ?? lastSupplyPoolTokenUid ?? params.intent.poolIdentifier;

      try {
        const { transactions: txs } = await requestEmberWithdrawTransactions({
          baseUrl: params.baseUrl,
          request: {
            walletAddress: params.intent.walletAddress,
            poolTokenUid: preferredPoolTokenUid,
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

          const desiredPoolAddress = params.intent.poolIdentifier.address.toLowerCase() as `0x${string}`;
          const resolved = positions.positions.find((position) => {
            if (position.poolTokenUid.address.toLowerCase() === desiredPoolAddress) {
              return true;
            }
            const poolAddress = tryExtractPoolAddressFromProviderId(position.providerId);
            return poolAddress?.toLowerCase() === desiredPoolAddress;
          })?.poolTokenUid;

          if (!resolved) {
            const available =
              positions.positions.length === 0
                ? "none"
                : positions.positions
                    .map((position) => {
                      const details = [
                        `poolTokenUid=${position.poolTokenUid.address}`,
                        position.poolName ? `poolName=${position.poolName}` : null,
                        position.providerId ? `providerId=${position.providerId}` : null,
                      ].filter(Boolean);
                      return details.join(" ");
                    })
                    .join("; ");

            console.warn(
              `demo/liquidity: skipping withdraw action[${index}] because Ember /liquidity/withdraw rejected the provided poolTokenUid and no matching poolTokenUid could be resolved from /liquidity/positions (available: ${available}). Provide intent.poolTokenUid, a wallet with an existing position, or pass a recorded withdraw tx plan via --tx-file.`,
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
              `demo/liquidity: withdraw action[${index}] required fallback poolTokenUid resolution via /liquidity/positions (resolved=${resolved.address}). Set intent.poolTokenUid to avoid this lookup.`,
            );
            continue;
          } catch (retryError: unknown) {
            if (isKnownEmberWithdrawUnsupportedError(retryError)) {
              console.warn(
                `demo/liquidity: skipping withdraw action[${index}] because Ember /liquidity/withdraw rejected both poolTokenUid=${preferredPoolTokenUid.address} and resolved poolTokenUid=${resolved.address} (Token ID not found). Provide a different wallet/pool or pass a recorded withdraw tx plan via --tx-file.`,
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
        const hint =
          action.amountType === "exactOut"
            ? " Try amountType=exactIn (some providers reject exactOut routes)."
            : "";
        const details =
          error instanceof EmberApiRequestError
            ? ` Ember error: ${truncateText({ value: error.bodyText, maxChars: 180 })}`
            : "";
        console.warn(
          `demo/liquidity: skipping swap action[${index}] because Ember /swap failed (HTTP 500 with embedded Axios error). Common causes: intent.walletAddress is the zero address (0x000...000), or the upstream swap provider is rejecting routes.${hint}${details}`,
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

  if (delegatee.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      "DEMO_DELEGATEE_ADDRESS / --delegatee must be a non-zero address (it must match the address derived from DEMO_DELEGATEE_PRIVATE_KEY when executing).",
    );
  }

  const delegatorAddress = privateKeyToAccount(delegatorPrivateKey).address.toLowerCase() as `0x${string}`;

  let resolvedIntent: EmberClmmIntent | null = null;

  if (intentFile) {
    const intent = await readJsonFile({
      filePath: intentFile,
      schema: EmberClmmIntentSchema,
    });

    let walletAddress = intent.walletAddress.toLowerCase() as `0x${string}`;
    if (walletAddress === ZERO_ADDRESS) {
      walletAddress = delegatorAddress;
      console.warn(
        `demo/liquidity: intent walletAddress is the zero address; using delegator address=${delegatorAddress} (derived from DEMO_DELEGATOR_PRIVATE_KEY). Update your intent file to avoid ambiguity.`,
      );
    } else if (walletAddress !== delegatorAddress) {
      throw new Error(
        `Intent walletAddress (${walletAddress}) must match the address derived from DEMO_DELEGATOR_PRIVATE_KEY (${delegatorAddress}).`,
      );
    }

    const resolved: EmberClmmIntent = { ...intent, walletAddress };
    resolvedIntent = resolved;
  }

  const txFiles = (txFile ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (outTxFile) {
    const outPath = resolve(outTxFile);
    const conflicts = txFiles.filter((file) => resolve(file) === outPath);
    if (conflicts.length > 0) {
      throw new Error(
        `DEMO_TX_FILE / --tx-file must not include the same path as DEMO_OUT_TX_FILE / --out-tx-file (${outTxFile}). txs.log is treated as an output/log artifact by default; remove it from tx inputs to avoid reading stale/overwritten plans.`,
      );
    }
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

  if (execute) {
    if (!rpcUrl || !delegateePrivateKey) {
      throw new Error(
        "Execution requested but missing DEMO_RPC_URL / --rpc-url or DEMO_DELEGATEE_PRIVATE_KEY / --delegatee-private-key.",
      );
    }

    const derivedDelegatee = privateKeyToAccount(delegateePrivateKey).address.toLowerCase() as `0x${string}`;
    if (derivedDelegatee !== delegatee.toLowerCase()) {
      throw new Error(
        `DEMO_DELEGATEE_ADDRESS (${delegatee.toLowerCase()}) must match the address derived from DEMO_DELEGATEE_PRIVATE_KEY (${derivedDelegatee}).`,
      );
    }

    if (simulate) {
      throw new Error("DEMO_SIMULATE=true is not supported when DEMO_EXECUTE=true (use plan-only mode).");
    }

    const { redeemDelegationsAndExecuteTransactions } = await import(
      "./execution/redeemAndExecute.js"
    );

    const options = {
      enforceTargetAllowlist: allowlist.length > 0,
      targetAllowlist: allowlist,
      allowNonZeroValue: (process.env["DEMO_ALLOW_NONZERO_VALUE"] ?? "false") === "true",
      allowEmptyCalldata: (process.env["DEMO_ALLOW_EMPTY_CALLDATA"] ?? "false") === "true",
      enforceTokenAllowlist,
      tokenAllowlist,
      erc20PeriodTransferCaps,
    } satisfies Parameters<typeof createSignedDelegationsForEmberTransactions>[0]["options"];

    const plannedTransactions: Array<z.infer<typeof EmberEvmTransactionSchema>> = [];
    const persistPlannedTransactions = async () => {
      if (!outTxFile) {
        return;
      }
      await writeFile(outTxFile, JSON.stringify({ transactions: plannedTransactions }, null, 2), "utf8");
    };

    const executeGroup = async (group: TransactionGroup) => {
      maybeInjectLiquidityManagerApprovals({ groups: [group] });
      plannedTransactions.push(...group.transactions);
      await persistPlannedTransactions();

      const result = await createSignedDelegationsForEmberTransactions({
        transactions: group.transactions,
        delegatorPrivateKey,
        delegatee,
        options,
      });

      console.info("demo/liquidity: delegation descriptions");
      for (const description of result.delegationDescriptions) {
        console.info(`- ${description}`);
      }

      console.info(
        stringifyWithBigints({
          message: "demo/liquidity: executing onchain (intent-ordered batch)",
          group: group.label,
          chainId: result.chainId,
          delegatee,
          delegationDescriptions: result.delegationDescriptions,
          transactions: result.normalizedTransactions.map((tx) => ({
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
        delegateePrivateKey,
        delegations: result.delegations,
        delegationIntents: result.delegationIntents,
        transactions: result.normalizedTransactions,
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
    };

    // Persist an empty file up-front so failures still leave a "fresh run" artifact for inspection.
    await persistPlannedTransactions();

    if (resolvedIntent) {
      for (let index = 0; index < resolvedIntent.actions.length; index += 1) {
        const actionGroups = await buildGroupsFromIntent({
          baseUrl,
          intent: resolvedIntent,
          skipSwaps: skipSwaps ?? false,
          onlyActionIndex: index,
        });
        for (const group of actionGroups) {
          await executeGroup(group);
        }
      }
    }

    for (const file of txFiles) {
      try {
        const raw = await readFile(file, "utf8");
        const parsed: unknown = JSON.parse(raw);
        const txsRaw = TransactionListSchema.parse(parsed);
        const txs = Array.isArray(txsRaw) ? txsRaw : txsRaw.transactions;
        await executeGroup({
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

    if (outTxFile) {
      console.info(`demo/liquidity: wrote Ember transactions to ${outTxFile}`);
    }

    return;
  }

  const groups: TransactionGroup[] = [];

  if (resolvedIntent) {
    groups.push(
      ...(await buildGroupsFromIntent({ baseUrl, intent: resolvedIntent, skipSwaps: skipSwaps ?? false })),
    );
  }

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

  maybeInjectLiquidityManagerApprovals({ groups });

  const transactions = groups.flatMap((group) => group.transactions);

  if (outTxFile) {
    await writeFile(outTxFile, JSON.stringify({ transactions }, null, 2), "utf8");
    console.info(`demo/liquidity: wrote Ember transactions to ${outTxFile}`);
  }

  const result = await createSignedDelegationsForEmberTransactions({
    transactions,
    delegatorPrivateKey,
    delegatee,
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

  if ((process.env["DEMO_PRINT_RESULT_JSON"] ?? "false") === "true") {
    console.info(stringifyWithBigints(result));
  }
}

main().catch((error: unknown) => {
  console.error("demo/liquidity: fatal error", error);
  process.exitCode = 1;
});
