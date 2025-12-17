import {
  createDelegation,
  getDeleGatorEnvironment,
  signDelegation,
  type DeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
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
  warnings: readonly string[];
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

  const selectorsByTarget = new Map<`0x${string}`, Set<`0x${string}`>>();
  const normalizedTransactions: NormalizedTransaction[] = transactions.map((transaction, index) => {
    const expectedChainId = parseChainId(transaction.chainId);
    if (expectedChainId !== chainId) {
      throw new Error(
        `Invalid input: mixed chain IDs (tx[0]=${chainId}, tx[${index}]=${expectedChainId})`,
      );
    }

    const value = parseValue(transaction.value);
    if (value !== 0n && !options.allowNonZeroValue) {
      throw new Error(
        `Non-zero value transaction rejected by policy (tx[${index}] value=${value.toString()})`,
      );
    }
    if (value !== 0n && options.allowNonZeroValue) {
      warnings.push(
        `WARNING: non-zero value tx included (tx[${index}] value=${value.toString()})`,
      );
    }

    const target = transaction.to.toLowerCase() as `0x${string}`;
    if (options.enforceTargetAllowlist && !allowlistSet.has(target)) {
      throw new Error(`Target not in allowlist: ${target}`);
    }

    const data = transaction.data.toLowerCase() as `0x${string}`;
    const selector = deriveSelector(data, { allowEmptyCalldata: options.allowEmptyCalldata });

    const selectorSet = selectorsByTarget.get(target) ?? new Set<`0x${string}`>();
    selectorSet.add(selector);
    selectorsByTarget.set(target, selectorSet);

    return {
      to: target,
      data,
      selector,
      value,
      chainId,
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

export async function createSignedDelegationsForEmberTransactions(params: {
  transactions: readonly EmberEvmTransaction[];
  delegatorPrivateKey: `0x${string}`;
  delegatee: `0x${string}`;
  options?: DelegationGenerationOptions;
}): Promise<DelegationGenerationResult> {
  const parsedTransactions = z.array(EmberEvmTransactionSchema).parse(params.transactions);
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

  const { chainId, normalizedTransactions, selectorsByTarget, warnings } =
    normalizeAndValidateTransactions(parsedTransactions, options);
  const selectorDiagnostics = selectorsByTargetToDiagnostics(selectorsByTarget);
  const environment = options.environment ?? getDeleGatorEnvironment(chainId);
  const delegatorAddress = privateKeyToAccount(params.delegatorPrivateKey).address.toLowerCase() as
    `0x${string}`;

  const delegations: Delegation[] = [];

  if (shouldConsolidate(selectorDiagnostics, options.consolidation)) {
    const targets = selectorDiagnostics.map((entry) => entry.target);
    const selectors = [...new Set(selectorDiagnostics.flatMap((entry) => entry.selectors))].sort(
      (a, b) => a.localeCompare(b),
    );

    const delegation = createDelegation({
      scope: {
        type: "functionCall",
        targets,
        selectors,
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
  } else {
    for (const entry of selectorDiagnostics) {
      const delegation = createDelegation({
        scope: {
          type: "functionCall",
          targets: [entry.target],
          selectors: [...entry.selectors],
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
  }

  return {
    chainId,
    normalizedTransactions,
    selectorDiagnostics,
    delegations,
    warnings,
  };
}
