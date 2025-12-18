import {
  normalizeEmberTransactionsForDelegations,
  type DelegationIntent,
  type EmberEvmTransaction,
} from "../delegations/emberDelegations.js";
import {
  EmberApiRequestError,
  requestEmberSupplyTransactions,
  requestEmberSwapTransactions,
  requestEmberWithdrawTransactions,
  requestEmberWalletPositions,
} from "../ember/emberLiquidityClient.js";

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

function isKnownEmberWithdrawUnsupportedError(error: unknown): boolean {
  if (!(error instanceof EmberApiRequestError)) {
    return false;
  }

  return error.status === 500 && /token id not found/i.test(error.bodyText);
}

function matchesIntent(params: {
  tx: { to: `0x${string}`; selector: `0x${string}`; data: `0x${string}` };
  intent: DelegationIntent;
}): boolean {
  if (!params.intent.targets.some((target) => target.toLowerCase() === params.tx.to.toLowerCase())) {
    return false;
  }
  if (!params.intent.selectors.some((selector) => selector.toLowerCase() === params.tx.selector.toLowerCase())) {
    return false;
  }

  for (const pin of params.intent.allowedCalldata) {
    const needle = pin.value.toLowerCase().slice(2);
    const start = 2 + pin.startIndex * 2;
    const end = start + needle.length;
    if (end > params.tx.data.length) {
      return false;
    }
    const actual = params.tx.data.slice(start, end).toLowerCase();
    if (actual !== needle) {
      return false;
    }
  }

  return true;
}

function validateAgainstIntents(params: {
  label: string;
  transactions: readonly EmberEvmTransaction[];
  delegationIntents: readonly DelegationIntent[];
  allowEmptyCalldata: boolean;
}): void {
  const normalized = normalizeEmberTransactionsForDelegations({
    transactions: params.transactions,
    options: { allowEmptyCalldata: params.allowEmptyCalldata },
  });

  const failures: string[] = [];
  for (const tx of normalized.normalizedTransactions) {
    const ok = params.delegationIntents.some((intent) => matchesIntent({ tx, intent }));
    if (!ok) {
      failures.push(`${params.label}: unauthorized call target=${tx.to} selector=${tx.selector}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Delegation simulation failed:\n${failures.join("\n")}`);
  }
}

function varyLimitedRange(params: { minPrice: string; maxPrice: string; cycle: number }) {
  const min = Number(params.minPrice);
  const max = Number(params.maxPrice);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
    return { minPrice: params.minPrice, maxPrice: params.maxPrice };
  }

  const bump = 0.001 * params.cycle;
  const nextMin = Math.max(1e-18, min * (1 - bump));
  const nextMax = Math.max(nextMin, max * (1 + bump));
  return { minPrice: nextMin.toString(), maxPrice: nextMax.toString() };
}

export async function validateNormalizedTransactionsAgainstDelegationIntents(params: {
  baseUrl: string;
  intent: EmberClmmIntent;
  cycles: number;
  delegationIntents: readonly DelegationIntent[];
  allowEmptyCalldata: boolean;
}): Promise<void> {
  if (params.cycles <= 0) {
    throw new Error("Simulation cycles must be > 0");
  }

  console.info(`demo/liquidity: simulation starting cycles=${params.cycles}`);

  for (let cycle = 0; cycle < params.cycles; cycle += 1) {
    console.info(`demo/liquidity: simulation cycle=${cycle + 1}/${params.cycles}`);

    for (let index = 0; index < params.intent.actions.length; index += 1) {
      const action = params.intent.actions[index];
      if (!action) {
        continue;
      }

      if (action.type === "supply") {
        const range =
          params.intent.range.type === "limited"
            ? { type: "limited" as const, ...varyLimitedRange({ ...params.intent.range, cycle }) }
            : params.intent.range;

        const { transactions } = await requestEmberSupplyTransactions({
          baseUrl: params.baseUrl,
          request: {
            walletAddress: params.intent.walletAddress,
            supplyChain: params.intent.chainId,
            poolIdentifier: params.intent.poolIdentifier,
            range,
            payableTokens: params.intent.payableTokens,
          },
        });

        validateAgainstIntents({
          label: `cycle=${cycle}:action[${index}]:supply`,
          transactions,
          delegationIntents: params.delegationIntents,
          allowEmptyCalldata: params.allowEmptyCalldata,
        });
        continue;
      }

      if (action.type === "withdraw") {
        try {
          const { transactions } = await requestEmberWithdrawTransactions({
            baseUrl: params.baseUrl,
            request: {
              walletAddress: params.intent.walletAddress,
              poolTokenUid: params.intent.poolIdentifier,
            },
          });
          validateAgainstIntents({
            label: `cycle=${cycle}:action[${index}]:withdraw`,
            transactions,
            delegationIntents: params.delegationIntents,
            allowEmptyCalldata: params.allowEmptyCalldata,
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
                `demo/liquidity: simulation skipping withdraw action[${index}] (Token ID not found and unable to resolve poolTokenUid from /liquidity/positions).`,
              );
              continue;
            }

            try {
              const { transactions } = await requestEmberWithdrawTransactions({
                baseUrl: params.baseUrl,
                request: {
                  walletAddress: params.intent.walletAddress,
                  poolTokenUid: resolved,
                },
              });
              validateAgainstIntents({
                label: `cycle=${cycle}:action[${index}]:withdraw`,
                transactions,
                delegationIntents: params.delegationIntents,
                allowEmptyCalldata: params.allowEmptyCalldata,
              });
              continue;
            } catch (retryError: unknown) {
              if (isKnownEmberWithdrawUnsupportedError(retryError)) {
                console.warn(
                  `demo/liquidity: simulation skipping withdraw action[${index}] (Token ID not found even after fallback poolTokenUid resolution).`,
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

      const { transactions } = await requestEmberSwapTransactions({
        baseUrl: params.baseUrl,
        request: {
          walletAddress: params.intent.walletAddress,
          amount: action.amount,
          amountType: action.amountType,
          fromTokenUid: action.fromTokenUid,
          toTokenUid: action.toTokenUid,
        },
      });
      validateAgainstIntents({
        label: `cycle=${cycle}:action[${index}]:swap`,
        transactions,
        delegationIntents: params.delegationIntents,
        allowEmptyCalldata: params.allowEmptyCalldata,
      });
    }
  }

  console.info("demo/liquidity: simulation complete (all planned calls authorized)");
}
