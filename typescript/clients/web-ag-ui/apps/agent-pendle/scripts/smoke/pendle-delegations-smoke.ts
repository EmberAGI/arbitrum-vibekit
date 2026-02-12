import {
  createDelegation,
  getDeleGatorEnvironment,
  Implementation,
  type MultiSigDeleGatorDeployParams,
  signDelegation,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { getCounterfactualAccountData } from '@metamask/delegation-toolkit/utils';
import { ExecutionMode } from '@metamask/delegation-toolkit';
import { createClient, parseGwei, parseUnits, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { signAuthorization } from 'viem/experimental';

import { createClients, createRpcTransport } from '../../src/clients/clients.js';
import { OnchainActionsClient, type TransactionPlan } from '../../src/clients/onchainActions.js';
import {
  ARBITRUM_CHAIN_ID,
  resolvePendleChainIds,
  resolveStablecoinWhitelist,
} from '../../src/config/constants.js';
import { buildEligibleYieldTokens } from '../../src/core/pendleMarkets.js';
import { normalizeTransactions } from '../../src/delegations/emberDelegations.js';

type HexString = `0x${string}`;

const resolveBaseUrl = (): string =>
  process.env['ONCHAIN_ACTIONS_API_URL'] ?? 'https://api.emberai.xyz';

type DelegatorMode = 'stateless7702' | 'multisig';

const resolveDelegatorMode = (): DelegatorMode => {
  const raw = process.env['PENDLE_SMOKE_DELEGATOR_MODE']?.trim().toLowerCase();
  if (!raw) return 'stateless7702';
  if (raw === 'stateless7702' || raw === 'multisig') return raw;
  throw new Error(`PENDLE_SMOKE_DELEGATOR_MODE must be stateless7702|multisig (got: ${raw})`);
};

const resolveMultisigDeploySalt = (): HexString => {
  const raw = process.env['PENDLE_SMOKE_MULTISIG_DEPLOY_SALT']?.trim();
  if (!raw) {
    return '0x0000000000000000000000000000000000000000000000000000000000000001' as HexString;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('PENDLE_SMOKE_MULTISIG_DEPLOY_SALT must be 32-byte hex (0x + 64 hex chars).');
  }
  return raw.toLowerCase() as HexString;
};

type OnchainActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

async function attempt<T>(fn: () => Promise<T>): Promise<OnchainActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function requireHexPrivateKey(envKey: string): HexString {
  const raw = process.env[envKey];
  if (!raw || raw === 'replace-with-private-key') {
    throw new Error(`${envKey} is required to run the delegation smoke script.`);
  }
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`${envKey} must be a 32-byte hex string (0x + 64 hex chars).`);
  }
  return trimmed as HexString;
}

function asHexAddress(value: string, label: string): HexString {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`${label} must be a 20-byte hex address (0x + 40 hex chars).`);
  }
  return trimmed.toLowerCase() as HexString;
}

function uniquePairs(pairs: Array<{ target: HexString; selector: HexString }>) {
  const seen = new Set<string>();
  const out: Array<{ target: HexString; selector: HexString }> = [];
  for (const pair of pairs) {
    const key = `${pair.target.toLowerCase()}:${pair.selector.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target: pair.target, selector: pair.selector });
  }
  return out;
}

function formatOnchainActionsError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

const run = async () => {
  const baseUrl = resolveBaseUrl();
  const chainIds = resolvePendleChainIds();
  const client = new OnchainActionsClient(baseUrl);

  const delegatorMode = resolveDelegatorMode();

  // Delegator owner EOA (signs the delegation). In stateless7702 mode, this is also the delegator address.
  const delegatorPrivateKey = requireHexPrivateKey('PENDLE_SMOKE_DELEGATOR_PRIVATE_KEY');
  const delegatorAccount = privateKeyToAccount(delegatorPrivateKey);
  const delegatorOwnerAddress = delegatorAccount.address.toLowerCase() as HexString;

  // Delegatee = agent/executor wallet (redeems delegation + executes calls).
  // We reuse the existing agent key env var used by local agent execution.
  const executorPrivateKey = requireHexPrivateKey('A2A_TEST_AGENT_NODE_PRIVATE_KEY');
  const executorAccount = privateKeyToAccount(executorPrivateKey);
  const executorAddress = executorAccount.address.toLowerCase() as HexString;

  const shouldExecute = (() => {
    const raw = process.env['PENDLE_SMOKE_EXECUTE']?.trim().toLowerCase();
    // Smoke is intended for real-tx feedback loops; default to EXECUTE when unset.
    if (!raw) return true;
    return raw === 'true';
  })();

  const environment = getDeleGatorEnvironment(ARBITRUM_CHAIN_ID);
  const delegationManager = asHexAddress(environment.DelegationManager, 'DelegationManager address');
  const factoryAddress = asHexAddress(environment.SimpleFactory, 'SimpleFactory address');

  let delegatorAddress: HexString;
  let multisigFactoryData: HexString | undefined;
  if (delegatorMode === 'stateless7702') {
    delegatorAddress = delegatorOwnerAddress;
  } else {
    const deploySalt = resolveMultisigDeploySalt();
    const deployParams = [[delegatorOwnerAddress], 1n] satisfies MultiSigDeleGatorDeployParams;
    const counterfactual = await getCounterfactualAccountData({
      factory: factoryAddress,
      implementations: environment.implementations,
      implementation: Implementation.MultiSig,
      // Implementation.MultiSig deployParams = [owners, threshold]
      deployParams,
      deploySalt,
    });
    delegatorAddress = counterfactual.address.toLowerCase() as HexString;
    multisigFactoryData = counterfactual.factoryData.toLowerCase() as HexString;
  }

  const executorClients = createClients(executorAccount);
  const rpcUrl = process.env['ARBITRUM_RPC_URL'] ?? 'https://arb1.arbitrum.io/rpc';
  const simulationClient = createClient({
    account: executorClients.wallet.account,
    chain: executorClients.wallet.chain,
    transport: createRpcTransport(rpcUrl),
  }).extend(publicActions);

  console.log('[smoke:delegations] onchain-actions:', baseUrl);
  console.log('[smoke:delegations] chainIds:', chainIds.join(','));
  console.log('[smoke:delegations] delegatorMode:', delegatorMode);
  console.log('[smoke:delegations] delegatorOwner:', delegatorOwnerAddress);
  console.log('[smoke:delegations] delegator:', delegatorAddress);
  console.log('[smoke:delegations] executor:', executorAddress);

  const delegatorCode = await executorClients.public.getCode({ address: delegatorAddress });
  const hasDelegatorCode = Boolean(delegatorCode && delegatorCode !== '0x');
  if (!hasDelegatorCode) {
    if (delegatorMode === 'stateless7702') {
      const impl = asHexAddress(
        environment.implementations.EIP7702StatelessDeleGatorImpl,
        'EIP7702StatelessDeleGatorImpl address',
      );
      console.log('[smoke:delegations] delegator has no code; broadcasting EIP-7702 upgrade authorization');

      const delegatorWalletClient = createClients(delegatorAccount).wallet;
      const authorization = await signAuthorization(delegatorWalletClient, {
        contractAddress: impl,
        executor: executorAddress,
      });

      const upgradeHash = await executorClients.wallet.sendTransaction({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        type: 'eip7702',
        account: executorClients.wallet.account,
        chain: executorClients.wallet.chain,
        to: delegatorAddress,
        data: '0x',
        value: 0n,
        authorizationList: [
          {
            chainId: authorization.chainId,
            address: authorization.address,
            nonce: authorization.nonce,
            r: authorization.r,
            s: authorization.s,
            v: authorization.v,
            yParity: authorization.yParity,
          },
        ],
        maxFeePerGas: parseGwei('0.1'),
        maxPriorityFeePerGas: parseGwei('0.01'),
      });
      console.log('[smoke:delegations] upgrade tx sent:', upgradeHash);
      await executorClients.public.waitForTransactionReceipt({ hash: upgradeHash });

      const codeAfterUpgrade = await executorClients.public.getCode({ address: delegatorAddress });
      if (!codeAfterUpgrade || codeAfterUpgrade === '0x') {
        throw new Error(`EIP-7702 upgrade did not result in code at ${delegatorAddress}`);
      }
      console.log('[smoke:delegations] delegator upgraded (7702 code present)');
    } else if (delegatorMode === 'multisig' && shouldExecute && multisigFactoryData) {
      console.log('[smoke:delegations] deploying multisig delegator via SimpleFactory:', factoryAddress);
      const deployHash = await executorClients.wallet.sendTransaction({
        account: executorClients.wallet.account,
        chain: executorClients.wallet.chain,
        to: factoryAddress,
        data: multisigFactoryData,
        value: 0n,
      });
      console.log('[smoke:delegations] deploy tx sent:', deployHash);
      await executorClients.public.waitForTransactionReceipt({ hash: deployHash });
      const codeAfter = await executorClients.public.getCode({ address: delegatorAddress });
      if (!codeAfter || codeAfter === '0x') {
        throw new Error(`Multisig delegator deployment did not result in code at ${delegatorAddress}`);
      }
      console.log('[smoke:delegations] multisig delegator deployed');
    } else {
      throw new Error(
        `Delegator address has no code on-chain (${delegatorAddress}). Delegations require a smart account.\n` +
          `Fix:\n` +
          `- If using stateless7702: upgrade this wallet via the UI upgrade flow (Privy 7702) first.\n` +
          `- If using multisig: run once with PENDLE_SMOKE_DELEGATOR_MODE=multisig and PENDLE_SMOKE_EXECUTE=true to deploy via SimpleFactory.`,
      );
    }
  }

  const [markets, tokens] = await Promise.all([
    client.listTokenizedYieldMarkets({ chainIds }),
    client.listTokens({ chainIds }),
  ]);
  if (markets.length === 0) {
    throw new Error('No tokenized yield markets returned.');
  }
  if (tokens.length === 0) {
    throw new Error('No tokens returned.');
  }

  const eligible = buildEligibleYieldTokens({
    markets,
    supportedTokens: tokens,
    whitelistSymbols: resolveStablecoinWhitelist(),
  });

  const stablecoinSymbols = new Set(
    resolveStablecoinWhitelist().map((symbol) => symbol.toLowerCase()),
  );
  const tokenByAddress = new Map(
    tokens.map((token) => [
      token.tokenUid.address.toLowerCase(),
      { symbol: token.symbol, chainId: token.tokenUid.chainId, decimals: token.decimals },
    ]),
  );

  const walletBalancesResult = await attempt(() => client.listWalletBalances(delegatorAddress));
  if (!walletBalancesResult.ok) {
    console.warn(
      '[smoke:delegations] Unable to load wallet balances; funding token auto-selection may be degraded:',
      formatOnchainActionsError(walletBalancesResult.error),
    );
  }

  const fundingTokenAddressFromEnv = process.env['PENDLE_SMOKE_FUNDING_TOKEN_ADDRESS']
    ? asHexAddress(
        process.env['PENDLE_SMOKE_FUNDING_TOKEN_ADDRESS'],
        'PENDLE_SMOKE_FUNDING_TOKEN_ADDRESS',
      )
    : undefined;

  const fundingTokenCandidatesFromBalances = walletBalancesResult.ok
    ? walletBalancesResult.data
        .filter((balance) => /^\d+$/.test(balance.amount))
        .map((balance) => {
          const token = tokenByAddress.get(balance.tokenUid.address.toLowerCase());
          const symbol = token?.symbol ?? balance.symbol ?? 'unknown';
          return {
            address: asHexAddress(balance.tokenUid.address, 'balance token address'),
            symbol,
            amount: BigInt(balance.amount),
          };
        })
        .filter((balance) => stablecoinSymbols.has(balance.symbol.toLowerCase()))
        .filter((balance) => balance.amount > 0n)
        .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))
    : [];

  const defaultMarketAddress = process.env['PENDLE_SMOKE_MARKET_ADDRESS']
    ? asHexAddress(process.env['PENDLE_SMOKE_MARKET_ADDRESS'], 'PENDLE_SMOKE_MARKET_ADDRESS')
    : (eligible[0]?.marketAddress?.toLowerCase() as HexString | undefined);

  const humanAmount = process.env['PENDLE_SMOKE_AMOUNT']?.trim() || '1';
  const amountBaseUnitsOverride = process.env['PENDLE_SMOKE_AMOUNT_BASE_UNITS']?.trim();
  if (amountBaseUnitsOverride && !/^\d+$/.test(amountBaseUnitsOverride)) {
    throw new Error('PENDLE_SMOKE_AMOUNT_BASE_UNITS must be a base-units integer string.');
  }

  const resolveAmountBaseUnits = (tokenAddress: HexString): string => {
    if (amountBaseUnitsOverride) {
      return amountBaseUnitsOverride;
    }
    const token = tokenByAddress.get(tokenAddress.toLowerCase());
    const decimals = token?.decimals ?? 18;
    const baseUnits = parseUnits(humanAmount, decimals);
    if (baseUnits <= 0n) {
      throw new Error(`Resolved amount is too small: ${humanAmount}`);
    }
    return baseUnits.toString();
  };

  const candidateMarketAddresses: HexString[] = [];
  if (defaultMarketAddress) {
    candidateMarketAddresses.push(defaultMarketAddress);
  }
  for (const item of eligible) {
    if (item.marketAddress) {
      candidateMarketAddresses.push(item.marketAddress.toLowerCase() as HexString);
    }
  }
  for (const market of markets) {
    candidateMarketAddresses.push(market.marketIdentifier.address.toLowerCase() as HexString);
  }
  const uniqueMarketAddresses = [...new Set(candidateMarketAddresses)];

  const fundingTokenCandidates: HexString[] = [];
  if (fundingTokenAddressFromEnv) {
    fundingTokenCandidates.push(fundingTokenAddressFromEnv);
  }
  for (const entry of fundingTokenCandidatesFromBalances) {
    fundingTokenCandidates.push(entry.address);
  }
  // As a last resort, try all whitelisted stablecoins even if wallet balances are missing.
  for (const token of tokens) {
    if (stablecoinSymbols.has(token.symbol.toLowerCase())) {
      fundingTokenCandidates.push(asHexAddress(token.tokenUid.address, `stablecoin ${token.symbol} address`));
    }
  }
  const uniqueFundingTokenCandidates = [...new Set(fundingTokenCandidates)];

  let selectedMarket = markets[0];
  let selectedMarketAddress = asHexAddress(selectedMarket.marketIdentifier.address, 'market address');
  let fundingTokenAddress = asHexAddress(selectedMarket.underlyingToken.tokenUid.address, 'market underlying token address');
  let buyResult: { ok: true; data: { transactions: TransactionPlan[] } } | undefined;
  let lastBuyError: unknown | undefined;

  console.log('[smoke:delegations] amount (human):', humanAmount);
  if (amountBaseUnitsOverride) {
    console.log('[smoke:delegations] amount (base units override):', amountBaseUnitsOverride);
  }
  console.log('[smoke:delegations] Searching for a buyPt plan that succeeds...');

  for (const marketCandidateAddress of uniqueMarketAddresses) {
    const candidateMarket =
      markets.find(
        (m) => m.marketIdentifier.address.toLowerCase() === marketCandidateAddress.toLowerCase(),
      ) ?? selectedMarket;

    const candidateChainId = candidateMarket.marketIdentifier.chainId;
    const candidateMarketAddress = asHexAddress(candidateMarket.marketIdentifier.address, 'market address');

    for (const tokenCandidate of uniqueFundingTokenCandidates) {
      const amountBaseUnits = resolveAmountBaseUnits(tokenCandidate);
      const outcome = await attempt(() =>
        client.createTokenizedYieldBuyPt({
          walletAddress: delegatorAddress,
          marketAddress: candidateMarketAddress,
          inputTokenUid: { chainId: candidateChainId, address: tokenCandidate },
          amount: amountBaseUnits,
          slippage: '0.5',
        }),
      );
      if (outcome.ok) {
        selectedMarket = candidateMarket;
        selectedMarketAddress = candidateMarketAddress;
        fundingTokenAddress = tokenCandidate;
        buyResult = outcome;
        break;
      }
      lastBuyError = outcome.error;
    }
    if (buyResult?.ok) {
      break;
    }
  }

  if (!buyResult) {
    throw new Error(
      `Unable to find any createTokenizedYieldBuyPt plan that succeeds (markets=${uniqueMarketAddresses.length}, fundingTokens=${uniqueFundingTokenCandidates.length}). Last error: ${
        lastBuyError ? formatOnchainActionsError(lastBuyError) : 'unknown'
      }`,
    );
  }

  console.log('[smoke:delegations] selected market:', selectedMarketAddress);
  console.log('[smoke:delegations] funding token:', fundingTokenAddress);
  console.log('[smoke:delegations] buyPt txs:', buyResult.data.transactions.length);

  const chainId = selectedMarket.marketIdentifier.chainId;
  const marketAddress = selectedMarketAddress;

  const ptHumanAmount = process.env['PENDLE_SMOKE_PT_AMOUNT']?.trim() || '1';
  const ptAmountBaseUnits = parseUnits(ptHumanAmount, selectedMarket.ptToken.decimals).toString();

  const sellResult = await attempt(() =>
    client.createTokenizedYieldSellPt({
      walletAddress: delegatorAddress,
      ptTokenUid: selectedMarket.ptToken.tokenUid,
      amount: ptAmountBaseUnits,
      slippage: '0.5',
    }),
  );
  if (!sellResult.ok) {
    throw new Error(`createTokenizedYieldSellPt failed: ${formatOnchainActionsError(sellResult.error)}`);
  }

  const redeemResult = await attempt(() =>
    client.createTokenizedYieldRedeemPt({
      walletAddress: delegatorAddress,
      ptTokenUid: selectedMarket.ptToken.tokenUid,
      amount: ptAmountBaseUnits,
    }),
  );
  if (!redeemResult.ok) {
    throw new Error(`createTokenizedYieldRedeemPt failed: ${formatOnchainActionsError(redeemResult.error)}`);
  }

  const claimResult = await attempt(() =>
    client.createTokenizedYieldClaimRewards({
      walletAddress: delegatorAddress,
      ytTokenUid: selectedMarket.ytToken.tokenUid,
    }),
  );
  if (!claimResult.ok) {
    throw new Error(`createTokenizedYieldClaimRewards failed: ${formatOnchainActionsError(claimResult.error)}`);
  }

  const plannedTxGroups: Array<{ label: string; txs: TransactionPlan[] }> = [
    { label: 'buyPt', txs: buyResult.data.transactions },
    { label: 'sellPt', txs: sellResult.data.transactions },
    { label: 'redeemPt', txs: redeemResult.data.transactions },
    { label: 'claimRewards', txs: claimResult.data.transactions },
  ];

  const ERC20_APPROVE_SELECTOR = '0x095ea7b3' as HexString;
  const stablecoinTargets = tokens
    .filter((token) => stablecoinSymbols.has(token.symbol.toLowerCase()))
    .map((token) => asHexAddress(token.tokenUid.address, `stablecoin ${token.symbol} address`));

  // Delegation intents are target+selector pairs. We include:
  // - all planned targets+selectors (excluding approve)
  // - stablecoin approve selectors for all whitelisted stablecoins
  const plannedPairs: Array<{ target: HexString; selector: HexString }> = [];
  for (const group of plannedTxGroups) {
    for (const tx of group.txs) {
      const target = asHexAddress(tx.to, `${group.label} tx.to`);
      const selector = tx.data.slice(0, 10).toLowerCase() as HexString;
      plannedPairs.push({ target, selector });
    }
  }
  for (const tokenAddress of stablecoinTargets) {
    plannedPairs.push({ target: tokenAddress, selector: ERC20_APPROVE_SELECTOR });
  }

  const intents = uniquePairs(plannedPairs);
  if (intents.length === 0) {
    throw new Error('No delegation intents generated.');
  }

  const targets = [...new Set(intents.map((intent) => intent.target))];
  const selectors = [...new Set(intents.map((intent) => intent.selector))];

  const unsigned = createDelegation({
    scope: { type: 'functionCall', targets, selectors },
    to: executorAddress,
    from: delegatorAddress,
    environment,
  });

  const signature = await signDelegation({
    privateKey: delegatorPrivateKey,
    delegation: {
      delegate: unsigned.delegate,
      delegator: unsigned.delegator,
      authority: unsigned.authority,
      caveats: unsigned.caveats,
      salt: unsigned.salt,
    },
    delegationManager,
    chainId: ARBITRUM_CHAIN_ID,
  });

  const signedDelegation = {
    delegate: unsigned.delegate.toLowerCase() as HexString,
    delegator: unsigned.delegator.toLowerCase() as HexString,
    authority: unsigned.authority.toLowerCase() as HexString,
    caveats: unsigned.caveats.map((caveat) => ({
      enforcer: caveat.enforcer.toLowerCase() as HexString,
      terms: caveat.terms.toLowerCase() as HexString,
      args: caveat.args.toLowerCase() as HexString,
    })),
    salt: unsigned.salt.toLowerCase() as HexString,
    signature: signature.toLowerCase() as HexString,
  };

  console.log('[smoke:delegations] delegationManager:', delegationManager);
  console.log('[smoke:delegations] intents:', intents.length);
  console.log('[smoke:delegations] mode:', shouldExecute ? 'EXECUTE' : 'SIMULATE');

  for (const group of plannedTxGroups) {
    const normalized = normalizeTransactions({ transactions: group.txs });
    console.log(`[smoke:delegations] ${group.label}: txs=${normalized.normalizedTransactions.length} mode=SingleDefault`);

    const executions = normalized.normalizedTransactions.map((tx) => ({
      target: tx.to,
      value: tx.value,
      callData: tx.data,
    }));

    if (!shouldExecute) {
      // Simulate the whole group in a single tx so intra-tx state (e.g. approve -> swap) is respected.
      await DelegationManager.simulate.redeemDelegations({
        client: simulationClient,
        delegationManagerAddress: delegationManager,
        delegations: [[signedDelegation]],
        modes: [executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault],
        executions: [executions],
      });
      continue;
    }

    for (const [txIndex, execution] of executions.entries()) {
      await DelegationManager.simulate.redeemDelegations({
        client: simulationClient,
        delegationManagerAddress: delegationManager,
        delegations: [[signedDelegation]],
        modes: [ExecutionMode.SingleDefault],
        executions: [[execution]],
      });

      const data = DelegationManager.encode.redeemDelegations({
        delegations: [[signedDelegation]],
        modes: [ExecutionMode.SingleDefault],
        executions: [[execution]],
      });

      const txHash = await executorClients.wallet.sendTransaction({
        account: executorClients.wallet.account,
        chain: executorClients.wallet.chain,
        to: delegationManager,
        data,
        value: 0n,
      });
      console.log(`[smoke:delegations] ${group.label}[${txIndex}]: sent ${txHash}`);
      const receipt = await executorClients.public.waitForTransactionReceipt({ hash: txHash });
      console.log(
        `[smoke:delegations] ${group.label}[${txIndex}]: confirmed status=${receipt.status} block=${receipt.blockNumber}`,
      );
    }
  }

  console.log('[smoke:delegations] OK');
  process.exit(0);
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke:delegations] FAILED:', message);
  process.exit(1);
});
