import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { signDelegationWithFallback } from '../../apps/web/src/utils/delegationSigning.js';
import { buildPortfolioManagerSetupInput } from '../../apps/web/src/utils/portfolioManagerSetup.js';

const WEB_PACKAGE_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/web/package.json',
);
const requireFromWeb = createRequire(WEB_PACKAGE_JSON_PATH);
const {
  getDeleGatorEnvironment,
  Implementation,
  toMetaMaskSmartAccount,
} = requireFromWeb('@metamask/delegation-toolkit') as typeof import('@metamask/delegation-toolkit');
const {
  custom,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseGwei,
  parseUnits,
} = requireFromWeb('viem') as typeof import('viem');
const { privateKeyToAccount } = requireFromWeb('viem/accounts') as typeof import('viem/accounts');
const { arbitrum } = requireFromWeb('viem/chains') as typeof import('viem/chains');
const { signAuthorization } = requireFromWeb('viem/experimental') as typeof import('viem/experimental');

type AgUiSnapshot = {
  snapshot?: {
    thread?: {
      lifecycle?: Record<string, unknown> | null;
      activity?: {
        events?: unknown[];
      } | null;
      artifacts?: {
        current?: {
          data?: unknown;
        } | null;
      } | null;
    } | null;
    tasks?: Array<{
      interrupts?: Array<{
        value?: unknown;
      }>;
    }> | null;
  } | null;
};

type AgentRunResult = {
  events: unknown[];
  snapshot: AgUiSnapshot | null;
  assistantText: string | null;
};

type WalletFundingConfig = {
  fundingPrivateKey: `0x${string}`;
  rootWalletAddress: `0x${string}`;
  rpcUrl: string;
  minRootEth: bigint;
  minRootWeth: bigint;
};

type SmokeChainConfig = {
  rootWalletAddress: `0x${string}`;
  rpcUrl: string;
};

type SwapBalances = {
  weth: bigint;
  usdc: bigint;
};

type SwapExecutionProof = {
  transactionHash: `0x${string}`;
  balances: SwapBalances;
};

type PublicClient = ReturnType<typeof createPublicClient>;

type IdentityFile = {
  root_owner: {
    private_key: `0x${string}`;
  };
  subagent: {
    private_key: `0x${string}`;
  };
};

type UnsignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: unknown[];
  salt: `0x${string}`;
};

type DelegationSigningInterruptPayload = {
  type: 'portfolio-manager-delegation-signing-request';
  chainId: number;
  delegationManager: `0x${string}`;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  delegationsToSign: UnsignedDelegation[];
};

const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
const DEFAULT_PORTFOLIO_MANAGER_BASE_URL = 'http://127.0.0.1:3420/ag-ui';
const DEFAULT_WEB_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
const CHAIN_ID = 42161;
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const;
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;
const RUN_TIMEOUT_MS = readInteger(process.env['PM_SWAP_SMOKE_RUN_TIMEOUT_MS']) ?? 180_000;
const BALANCE_DELTA_TIMEOUT_MS =
  readInteger(process.env['PM_SWAP_SMOKE_BALANCE_DELTA_TIMEOUT_MS']) ?? 30_000;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/u;
const WETH_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
] as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readInteger(value: unknown): number | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readBool(value: unknown): boolean {
  const normalized = readString(value)?.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const entries: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    entries[key] = rawValue.replace(/^['"]|['"]$/gu, '');
  }

  return entries;
}

function parseJsonMaybe<T>(value: unknown): T | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function findSessionRoot(): string | null {
  let current = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  while (true) {
    if (
      existsSync(path.join(current, 'worktrees')) &&
      existsSync(path.join(current, 'runtime'))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveBundleRoot(): string | null {
  const explicit =
    readString(process.env['PM_SWAP_SMOKE_BUNDLE_ROOT']) ??
    readString(process.env['WALLET_QA_BUNDLE_ROOT']);
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const sessionRoot = findSessionRoot();
  if (!sessionRoot) {
    return null;
  }

  const runtimeDir = path.join(sessionRoot, 'runtime');
  const candidates = readdirSync(runtimeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes('local-stack-env'))
    .map((entry) => path.join(runtimeDir, entry.name));

  return candidates[0] ?? null;
}

function findWorktreesRoot(): string | null {
  let current = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

  while (true) {
    const candidate = path.join(current, 'worktrees');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveSingleWorktree(prefix: string): string | null {
  const worktreesRoot = findWorktreesRoot();
  if (!worktreesRoot) {
    return null;
  }

  const matches = readdirSync(worktreesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === prefix || name.startsWith(`${prefix}-`));

  if (matches.length !== 1) {
    return null;
  }

  return path.join(worktreesRoot, matches[0]!);
}

function resolveIdentitiesFilePath(): string | null {
  const explicitPath = readString(process.env['PM_SWAP_SMOKE_IDENTITIES_PATH']);
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const explicitSpecRoot = readString(process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT']);
  if (explicitSpecRoot) {
    const candidate = path.join(explicitSpecRoot, 'smoke.identities.local.json');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const inferredSpecRoot = resolveSingleWorktree('ember-orchestration-v1-spec');
  if (inferredSpecRoot) {
    const candidate = path.join(inferredSpecRoot, 'smoke.identities.local.json');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readIdentities(): IdentityFile {
  const identitiesPath = resolveIdentitiesFilePath();
  if (identitiesPath) {
    return JSON.parse(readFileSync(identitiesPath, 'utf8')) as IdentityFile;
  }

  const bundleRoot = resolveBundleRoot();
  if (!bundleRoot) {
    throw new Error(
      'Unable to resolve smoke identities or local stack bundle. Set PM_SWAP_SMOKE_IDENTITIES_PATH, EMBER_ORCHESTRATION_V1_SPEC_ROOT, or PM_SWAP_SMOKE_BUNDLE_ROOT.',
    );
  }

  const webEnv = parseDotEnvFile(path.join(bundleRoot, 'vibekit', 'web.env'));
  const rootOwnerPrivateKey = readString(webEnv['FUNDING_WALLET_PRIVATE_KEY']);
  if (!rootOwnerPrivateKey?.startsWith('0x')) {
    throw new Error('Bundle vibekit/web.env is missing FUNDING_WALLET_PRIVATE_KEY.');
  }

  const managedOnboardingPath = path.join(
    bundleRoot,
    'shared-ember',
    'shared-ember-managed-onboarding.ember-lending.json',
  );
  const managedOnboarding = existsSync(managedOnboardingPath)
    ? (JSON.parse(readFileSync(managedOnboardingPath, 'utf8')) as Record<string, unknown>)
    : {};
  const emberLending =
    isRecord(managedOnboarding['ember-lending']) ? managedOnboarding['ember-lending'] : {};
  const controllerPrivateKey = readString(emberLending['controllerPrivateKey']);

  return {
    root_owner: {
      private_key: rootOwnerPrivateKey as `0x${string}`,
    },
    subagent: {
      private_key: (controllerPrivateKey?.startsWith('0x')
        ? controllerPrivateKey
        : rootOwnerPrivateKey) as `0x${string}`,
    },
  };
}

function parseReadyLine(line: string): Record<string, unknown> | null {
  const marker = 'READY ';
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(line.slice(markerIndex + marker.length));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveLatestWalletQaReady(): Record<string, unknown> | null {
  const sessionRoot = findSessionRoot();
  if (!sessionRoot) {
    return null;
  }

  const stackDir = path.join(sessionRoot, 'runtime', 'wallet-qa-stack');
  if (!existsSync(stackDir)) {
    return null;
  }

  const launcherLogs = readdirSync(stackDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('launcher') && entry.name.endsWith('.log'))
    .map((entry) => {
      const filePath = path.join(stackDir, entry.name);
      return {
        filePath,
        mtimeMs: statSync(filePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const log of launcherLogs) {
    const ready = readFileSync(log.filePath, 'utf8')
      .split(/\r?\n/u)
      .map(parseReadyLine)
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .at(-1);
    if (ready) {
      return ready;
    }
  }

  return null;
}

function resolvePortfolioManagerBaseUrl(): string {
  const explicit =
    readString(process.env['PM_SWAP_SMOKE_PORTFOLIO_MANAGER_BASE_URL']) ??
    readString(process.env['PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL']);
  if (explicit) {
    return explicit;
  }

  const ready = resolveLatestWalletQaReady();
  return readString(ready?.['portfolioManagerBaseUrl']) ?? DEFAULT_PORTFOLIO_MANAGER_BASE_URL;
}

function resolveWebBaseUrl(): string {
  return (
    readString(process.env['PM_SWAP_SMOKE_WEB_BASE_URL']) ??
    readString(resolveLatestWalletQaReady()?.['webBaseUrl']) ??
    DEFAULT_WEB_BASE_URL
  );
}

function resolveChainConfig(rootWalletAddressOverride?: `0x${string}`): SmokeChainConfig {
  const bundleRoot = resolveBundleRoot();
  const webEnv = bundleRoot
    ? parseDotEnvFile(path.join(bundleRoot, 'vibekit', 'web.env'))
    : {};
  const typescriptEnv = bundleRoot
    ? parseDotEnvFile(path.join(bundleRoot, 'vibekit', 'typescript.env'))
    : {};
  const rootWalletAddress =
    rootWalletAddressOverride ??
    readString(process.env['PM_SWAP_SMOKE_ROOT_WALLET_ADDRESS']) ??
    readString(webEnv['NEXT_PUBLIC_WALLET_BYPASS_ADDRESS']);
  if (!rootWalletAddress?.startsWith('0x')) {
    throw new Error(
      'PM_SWAP_SMOKE_ROOT_WALLET_ADDRESS or bundle NEXT_PUBLIC_WALLET_BYPASS_ADDRESS is required to prove actual swap balance deltas.',
    );
  }

  return {
    rootWalletAddress: rootWalletAddress as `0x${string}`,
    rpcUrl:
      readString(process.env['ARBITRUM_RPC_URL']) ??
      readString(typescriptEnv['RPC_URL']) ??
      DEFAULT_ARBITRUM_RPC_URL,
  };
}

function resolveFundingConfig(chainConfig: SmokeChainConfig): WalletFundingConfig | null {
  if (!readBool(process.env['PM_SWAP_SMOKE_ENABLE_FUNDING'])) {
    return null;
  }

  const bundleRoot = resolveBundleRoot();
  const webEnv = bundleRoot
    ? parseDotEnvFile(path.join(bundleRoot, 'vibekit', 'web.env'))
    : {};
  const fundingPrivateKey = readString(process.env['PM_SWAP_SMOKE_FUNDING_WALLET_PRIVATE_KEY']) ??
    readString(webEnv['FUNDING_WALLET_PRIVATE_KEY']);
  if (!fundingPrivateKey?.startsWith('0x')) {
    throw new Error('Funding is enabled, but FUNDING_WALLET_PRIVATE_KEY was not found.');
  }

  return {
    fundingPrivateKey: fundingPrivateKey as `0x${string}`,
    rootWalletAddress: chainConfig.rootWalletAddress,
    rpcUrl: chainConfig.rpcUrl,
    minRootEth: parseUnits(process.env['PM_SWAP_SMOKE_MIN_ROOT_ETH'] ?? '0.00015', 18),
    minRootWeth: parseUnits(process.env['PM_SWAP_SMOKE_MIN_ROOT_WETH'] ?? '0.001', 18),
  };
}

async function ensureSmokeFunding(config: WalletFundingConfig): Promise<void> {
  const account = privateKeyToAccount(config.fundingPrivateKey);
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(config.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(config.rpcUrl),
  });

  const rootEthBalance = await publicClient.getBalance({ address: config.rootWalletAddress });
  if (rootEthBalance < config.minRootEth) {
    const hash = await walletClient.sendTransaction({
      account,
      to: config.rootWalletAddress,
      value: config.minRootEth - rootEthBalance,
      chain: arbitrum,
      maxFeePerGas: parseGwei('0.1'),
      maxPriorityFeePerGas: parseGwei('0.01'),
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(JSON.stringify({ phase: 'funding-root-eth', hash }));
  }

  const rootWethBalance = await publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [config.rootWalletAddress],
  });
  if (rootWethBalance >= config.minRootWeth) {
    console.log(
      JSON.stringify({
        phase: 'funding-skip-weth',
        rootWalletAddress: config.rootWalletAddress,
      }),
    );
    return;
  }

  const deficit = config.minRootWeth - rootWethBalance;
  const fundingWethBalance = await publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  if (fundingWethBalance < deficit) {
    const depositHash = await walletClient.sendTransaction({
      account,
      to: WETH,
      value: deficit - fundingWethBalance,
      data: encodeFunctionData({
        abi: WETH_ABI,
        functionName: 'deposit',
      }),
      chain: arbitrum,
      maxFeePerGas: parseGwei('0.1'),
      maxPriorityFeePerGas: parseGwei('0.01'),
    });
    await publicClient.waitForTransactionReceipt({ hash: depositHash });
    console.log(JSON.stringify({ phase: 'funding-wrap-weth', hash: depositHash }));
  }

  const transferHash = await walletClient.sendTransaction({
    account,
    to: WETH,
    value: 0n,
    data: encodeFunctionData({
      abi: WETH_ABI,
      functionName: 'transfer',
      args: [config.rootWalletAddress, deficit],
    }),
    chain: arbitrum,
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });
  await publicClient.waitForTransactionReceipt({ hash: transferHash });
  console.log(JSON.stringify({ phase: 'funding-transfer-weth', hash: transferHash }));
}

async function readTokenBalance(input: {
  publicClient: PublicClient;
  tokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}): Promise<bigint> {
  return await input.publicClient.readContract({
    address: input.tokenAddress,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.walletAddress],
  });
}

async function readSwapBalances(input: {
  publicClient: PublicClient;
  walletAddress: `0x${string}`;
}): Promise<SwapBalances> {
  const [weth, usdc] = await Promise.all([
    readTokenBalance({
      publicClient: input.publicClient,
      tokenAddress: WETH,
      walletAddress: input.walletAddress,
    }),
    readTokenBalance({
      publicClient: input.publicClient,
      tokenAddress: USDC,
      walletAddress: input.walletAddress,
    }),
  ]);
  return { weth, usdc };
}

function formatSwapBalances(balances: SwapBalances): Record<string, string> {
  return {
    weth: formatUnits(balances.weth, 18),
    usdc: formatUnits(balances.usdc, 6),
  };
}

function createBrowserStyleSigningWalletClient(
  account: ReturnType<typeof privateKeyToAccount>,
) {
  const provider = {
    async request(input: { method: string; params?: unknown[] }) {
      const { method, params } = input;
      if (method === 'eth_chainId') {
        return `0x${CHAIN_ID.toString(16)}`;
      }

      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [account.address];
      }

      if (method === 'eth_signTypedData_v4') {
        const [, typedDataJson] = Array.isArray(params) ? params : [];
        const typedData =
          typeof typedDataJson === 'string' ? JSON.parse(typedDataJson) : typedDataJson;
        const { domain, types, primaryType, message } = typedData as {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        };
        const { EIP712Domain: _ignoredDomain, ...restTypes } = types ?? {};
        return account.signTypedData({
          domain,
          types: restTypes as Record<string, readonly { name: string; type: string }[]>,
          primaryType,
          message,
        });
      }

      throw new Error(`Unsupported browser-style signing method: ${method}`);
    },
  };

  return createWalletClient({
    account: account.address,
    chain: arbitrum,
    transport: custom(provider),
  });
}

async function ensureStateless7702Ready(input: {
  publicClient: PublicClient;
  ownerWalletClient: ReturnType<typeof createWalletClient>;
  executorAccount: ReturnType<typeof privateKeyToAccount>;
  rootAddress: `0x${string}`;
  rpcUrl: string;
}): Promise<void> {
  const currentCode = await input.publicClient.getCode({ address: input.rootAddress });
  if (currentCode && currentCode !== '0x') {
    return;
  }

  const environment = getDeleGatorEnvironment(CHAIN_ID);
  const implementationAddress = environment.implementations.EIP7702StatelessDeleGatorImpl;
  const authorization = await signAuthorization(input.ownerWalletClient, {
    contractAddress: implementationAddress,
    executor: input.executorAccount.address,
  });

  const executorWalletClient = createWalletClient({
    account: input.executorAccount,
    chain: arbitrum,
    transport: http(input.rpcUrl),
  });

  const upgradeHash = await executorWalletClient.sendTransaction({
    type: 'eip7702',
    account: input.executorAccount,
    chain: arbitrum,
    to: input.rootAddress,
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
    gas: 120000n,
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });

  await input.publicClient.waitForTransactionReceipt({ hash: upgradeHash });

  const codeAfterUpgrade = await input.publicClient.getCode({ address: input.rootAddress });
  if (!codeAfterUpgrade || codeAfterUpgrade === '0x') {
    throw new Error(`7702 upgrade did not install code at ${input.rootAddress}`);
  }

  console.log(JSON.stringify({ phase: 'root-7702-upgrade', hash: upgradeHash }));
}

async function ensureRootSmartHasWeth(input: {
  publicClient: PublicClient;
  walletClient: ReturnType<typeof createWalletClient>;
  ownerAccount: ReturnType<typeof privateKeyToAccount>;
  rootSmartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  minimumBalance: bigint;
}): Promise<bigint> {
  const currentBalance = await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.rootSmartAccount.address],
  });

  if (currentBalance >= input.minimumBalance) {
    return currentBalance;
  }

  const depositAmount = input.minimumBalance - currentBalance;
  const depositHash = await input.walletClient.sendTransaction({
    account: input.ownerAccount,
    to: WETH,
    value: depositAmount,
    data: encodeFunctionData({
      abi: WETH_ABI,
      functionName: 'deposit',
    }),
  });
  await input.publicClient.waitForTransactionReceipt({ hash: depositHash });
  console.log(JSON.stringify({ phase: 'root-wrap-weth', hash: depositHash }));

  return await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.rootSmartAccount.address],
  });
}

function parseEventStreamBody(body: string): unknown[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

async function readEventStreamUntilStateSnapshot(response: Response): Promise<unknown[]> {
  const reader = response.body?.getReader();
  if (!reader) {
    return [];
  }

  const decoder = new TextDecoder();
  const events: unknown[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const event = JSON.parse(line.slice('data: '.length));
        events.push(event);
        if (isRecord(event) && event['type'] === 'STATE_SNAPSHOT') {
          await reader.cancel();
          return events;
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  return events;
}

function findStateSnapshot(events: unknown[]): AgUiSnapshot | null {
  const snapshot = [...events].reverse().find(
    (event) => isRecord(event) && event['type'] === 'STATE_SNAPSHOT',
  );
  return (snapshot as AgUiSnapshot | undefined) ?? null;
}

function findMessagesSnapshotEvent(events: unknown[]) {
  const snapshot = [...events].reverse().find(
    (event) => isRecord(event) && event['type'] === 'MESSAGES_SNAPSHOT' && Array.isArray(event['messages']),
  );
  return isRecord(snapshot) ? snapshot : null;
}

function readMessageContentText(content: unknown): string | null {
  if (typeof content === 'string' && content.trim().length > 0) {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((part) => (isRecord(part) && part['type'] === 'text' ? readString(part['text']) : null))
    .filter((part): part is string => part !== null)
    .join('');

  return text.trim().length > 0 ? text : null;
}

function readLatestAssistantText(events: unknown[]): string | null {
  const messages = findMessagesSnapshotEvent(events)?.['messages'];
  if (!Array.isArray(messages)) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    if (!isRecord(message) || readString(message['role']) !== 'assistant') {
      continue;
    }

    const text = readMessageContentText(message['content']);
    if (text) {
      return text;
    }
  }

  return null;
}

function compactRunText(result: AgentRunResult): string {
  return [
    result.assistantText,
    JSON.stringify(result.snapshot?.snapshot?.thread?.lifecycle ?? null),
    JSON.stringify(result.snapshot?.snapshot?.thread?.artifacts?.current?.data ?? null),
    JSON.stringify(result.events),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n')
    .slice(0, 30_000);
}

function truncateForLog(text: string, maxLength = 500): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function readTransactionHash(value: unknown): `0x${string}` | null {
  const candidate = readString(value);
  return candidate && TRANSACTION_HASH_PATTERN.test(candidate)
    ? (candidate as `0x${string}`)
    : null;
}

function findTransactionHash(value: unknown, depth = 0): `0x${string}` | null {
  if (depth > 8) {
    return null;
  }

  const direct = readTransactionHash(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findTransactionHash(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['lastExecutionTxHash', 'transactionHash', 'transaction_hash', 'txHash']) {
    const nested = readTransactionHash(value[key]);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = findTransactionHash(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function readExecutionTransactionHash(result: AgentRunResult): `0x${string}` | null {
  return (
    findTransactionHash(result.snapshot?.snapshot?.thread?.lifecycle) ??
    findTransactionHash(result.snapshot?.snapshot?.thread?.artifacts?.current?.data) ??
    findTransactionHash(result.events)
  );
}

function readSnapshotLifecycle(snapshot: AgUiSnapshot | null) {
  return snapshot?.snapshot?.thread?.lifecycle ?? null;
}

function readSnapshotArtifact(snapshot: AgUiSnapshot | null) {
  return snapshot?.snapshot?.thread?.artifacts?.current?.data ?? null;
}

function readSnapshotActivityEvents(snapshot: AgUiSnapshot | null): unknown[] {
  const events = snapshot?.snapshot?.thread?.activity?.events;
  return Array.isArray(events) ? events : [];
}

function readSnapshotTaskInterrupts(snapshot: AgUiSnapshot | null): unknown[] {
  const tasks = snapshot?.snapshot?.tasks;
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks.flatMap((task) => {
    const interrupts = task?.interrupts;
    return Array.isArray(interrupts) ? interrupts.map((interrupt) => interrupt?.value) : [];
  });
}

function readInterruptPayloadFromUnknown(value: unknown): DelegationSigningInterruptPayload | null {
  const candidate =
    typeof value === 'string' ? parseJsonMaybe<Record<string, unknown>>(value) : value;
  if (!isRecord(candidate)) {
    return null;
  }

  const type = readString(candidate['type']);
  if (type && type !== 'portfolio-manager-delegation-signing-request') {
    return null;
  }

  const chainId = candidate['chainId'];
  const delegationManager = readString(candidate['delegationManager']) as `0x${string}` | null;
  const delegatorAddress = readString(candidate['delegatorAddress']) as `0x${string}` | null;
  const delegateeAddress = readString(candidate['delegateeAddress']) as `0x${string}` | null;
  const delegationsToSign = candidate['delegationsToSign'];

  if (
    typeof chainId !== 'number' ||
    !delegationManager ||
    !delegatorAddress ||
    !delegateeAddress ||
    !Array.isArray(delegationsToSign)
  ) {
    return null;
  }

  return {
    type: 'portfolio-manager-delegation-signing-request',
    chainId,
    delegationManager,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: delegationsToSign as UnsignedDelegation[],
  };
}

function findPortfolioManagerSigningInterrupt(
  value: unknown,
  depth = 0,
): DelegationSigningInterruptPayload | null {
  if (depth > 8) {
    return null;
  }

  const direct = readInterruptPayloadFromUnknown(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findPortfolioManagerSigningInterrupt(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const nestedValue of Object.values(value)) {
    const nested = findPortfolioManagerSigningInterrupt(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function readPortfolioManagerSigningInterrupt(
  snapshot: AgUiSnapshot | null,
  events: unknown[] = [],
): DelegationSigningInterruptPayload | null {
  const eventInterrupt = findPortfolioManagerSigningInterrupt(events);
  if (eventInterrupt) {
    return eventInterrupt;
  }

  const currentArtifact = readSnapshotArtifact(snapshot);
  if (isRecord(currentArtifact) && currentArtifact['type'] === 'interrupt-status') {
    const interruptPayload = readInterruptPayloadFromUnknown(currentArtifact['payload']);
    if (interruptPayload) {
      return interruptPayload;
    }
  }

  for (const event of readSnapshotActivityEvents(snapshot)) {
    if (!isRecord(event) || !Array.isArray(event['parts'])) {
      continue;
    }

    for (const part of event['parts']) {
      if (!isRecord(part) || part['kind'] !== 'a2ui' || !isRecord(part['data'])) {
        continue;
      }

      const payload = part['data']['payload'];
      if (!isRecord(payload)) {
        continue;
      }

      const maybeInterrupt =
        readString(payload['kind']) === 'interrupt' ? payload['payload'] : payload;
      const interruptPayload = readInterruptPayloadFromUnknown(maybeInterrupt);
      if (interruptPayload) {
        return interruptPayload;
      }
    }
  }

  for (const interruptValue of readSnapshotTaskInterrupts(snapshot)) {
    const interruptPayload = readInterruptPayloadFromUnknown(interruptValue);
    if (interruptPayload) {
      return interruptPayload;
    }
  }

  return null;
}

function readStateDeltaOperations(events: unknown[]): Array<Record<string, unknown>> {
  return events.flatMap((event) => {
    if (!isRecord(event) || event['type'] !== 'STATE_DELTA' || !Array.isArray(event['delta'])) {
      return [];
    }
    return event['delta'].filter((operation): operation is Record<string, unknown> =>
      isRecord(operation),
    );
  });
}

function hasStateReplace(input: {
  events: unknown[];
  path: string;
  value: unknown;
}): boolean {
  return readStateDeltaOperations(input.events).some(
    (operation) =>
      operation['op'] === 'replace' &&
      operation['path'] === input.path &&
      operation['value'] === input.value,
  );
}

async function signRootDelegation(input: {
  walletClient: ReturnType<typeof createWalletClient>;
  delegation: UnsignedDelegation;
  delegationManager: `0x${string}`;
  chainId: number;
  account: `0x${string}`;
}) {
  return await signDelegationWithFallback({
    walletClient: input.walletClient,
    delegation: input.delegation,
    delegationManager: input.delegationManager,
    chainId: input.chainId,
    account: input.account,
  });
}

async function runAgentCommand(input: {
  baseUrl: string;
  webBaseUrl?: string;
  threadId: string;
  runId: string;
  command: Record<string, unknown>;
}): Promise<{ events: unknown[]; snapshot: AgUiSnapshot | null }> {
  if (input.webBaseUrl) {
    const commandName = readString(input.command['name']);
    const commandInput = input.command['input'];
    const resumeInput = input.command['resume'];
    const payload = Object.prototype.hasOwnProperty.call(input.command, 'resume')
      ? {
          agentId: PORTFOLIO_MANAGER_AGENT_ID,
          threadId: input.threadId,
          resume: resumeInput,
        }
      : {
          agentId: PORTFOLIO_MANAGER_AGENT_ID,
          threadId: input.threadId,
          command: {
            name: commandName,
            ...(Object.prototype.hasOwnProperty.call(input.command, 'input')
              ? { input: commandInput }
              : {}),
          },
        };
    const response = await fetch(`${input.webBaseUrl}/api/agent-command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(
        `${PORTFOLIO_MANAGER_AGENT_ID} web command failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }

    await response.json();
    return connectAgent({
      baseUrl: input.baseUrl,
      threadId: input.threadId,
      runId: `${input.runId}-snapshot`,
    });
  }

  const response = await fetch(`${input.baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      threadId: input.threadId,
      runId: input.runId,
      forwardedProps: {
        command: input.command,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${PORTFOLIO_MANAGER_AGENT_ID} command run failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const events = parseEventStreamBody(await response.text());
  return {
    events,
    snapshot: findStateSnapshot(events),
  };
}

async function connectAgent(input: {
  baseUrl: string;
  threadId: string;
  runId: string;
}): Promise<{ events: unknown[]; snapshot: AgUiSnapshot | null }> {
  const response = await fetch(`${input.baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/connect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      threadId: input.threadId,
      runId: input.runId,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${PORTFOLIO_MANAGER_AGENT_ID} connect failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const events = await readEventStreamUntilStateSnapshot(response);
  return {
    events,
    snapshot: findStateSnapshot(events),
  };
}

async function runAgentMessage(input: {
  baseUrl: string;
  threadId: string;
  runId: string;
  prompt: string;
}): Promise<AgentRunResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const response = await fetch(`${input.baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        threadId: input.threadId,
        runId: input.runId,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: input.prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${PORTFOLIO_MANAGER_AGENT_ID} message run failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }

    const events = parseEventStreamBody(await response.text());
    return {
      events,
      snapshot: findStateSnapshot(events),
      assistantText: readLatestAssistantText(events),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertNoObviousFailure(stage: string, result: AgentRunResult): void {
  const text = compactRunText(result);
  if (
    /\b(failed|failure|could not|couldn't|can't|cannot|blocked|error|reverted|no transaction was sent|not submitted|invalid_request|internal_error|timed out)\b/iu.test(
      text,
    )
  ) {
    throw new Error(`${stage} surfaced a failure through AG-UI:\n${truncateForLog(text, 2_000)}`);
  }
}

async function assertActualSwapExecution(input: {
  stage: string;
  result: AgentRunResult;
  publicClient: PublicClient;
  walletAddress: `0x${string}`;
  before: SwapBalances;
}): Promise<SwapExecutionProof> {
  assertNoObviousFailure(input.stage, input.result);

  const transactionHash = readExecutionTransactionHash(input.result);
  if (!transactionHash) {
    throw new Error(
      `${input.stage} completed without an AG-UI-surfaced execution transaction hash:\n${truncateForLog(
        compactRunText(input.result),
        2_000,
      )}`,
    );
  }

  const receipt = await input.publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    throw new Error(`${input.stage} transaction ${transactionHash} did not succeed.`);
  }

  const startedAt = Date.now();
  let latest = await readSwapBalances({
    publicClient: input.publicClient,
    walletAddress: input.walletAddress,
  });
  while (
    !(latest.weth < input.before.weth && latest.usdc > input.before.usdc) &&
    Date.now() - startedAt < BALANCE_DELTA_TIMEOUT_MS
  ) {
    await sleep(1_000);
    latest = await readSwapBalances({
      publicClient: input.publicClient,
      walletAddress: input.walletAddress,
    });
  }

  if (!(latest.weth < input.before.weth && latest.usdc > input.before.usdc)) {
    throw new Error(
      `${input.stage} transaction ${transactionHash} did not produce a WETH -> USDC root-wallet balance delta. ` +
        `before=${JSON.stringify(formatSwapBalances(input.before))} after=${JSON.stringify(formatSwapBalances(latest))}`,
    );
  }

  return {
    transactionHash,
    balances: latest,
  };
}

function assertReservedConfirmationGate(stage: string, result: AgentRunResult): void {
  const text = compactRunText(result);
  if (/\b(completed|swapped|submitted|confirmed transaction)\b/iu.test(text)) {
    return;
  }
  if (!/\breserved\b/iu.test(text) || !/\b(confirm|proceed|confirmation)\b/iu.test(text)) {
    throw new Error(`${stage} did not surface the reserved-capital confirmation gate:\n${truncateForLog(text, 2_000)}`);
  }
}

function buildReservedWethManagedMandate(rootWalletAddress: `0x${string}`) {
  return buildPortfolioManagerSetupInput(rootWalletAddress, {
    collateralPoliciesInput:
      readString(process.env['PM_SWAP_SMOKE_RESERVED_COLLATERAL_POLICIES_INPUT']) ??
      'WETH:35, USDC:35',
    allowedBorrowAssetsInput:
      readString(process.env['PM_SWAP_SMOKE_RESERVED_ALLOWED_BORROW_ASSETS_INPUT']) ?? 'USDC',
  }).firstManagedMandate.managedMandate;
}

async function onboardPortfolioManagerThread(input: {
  baseUrl: string;
  webBaseUrl: string;
  threadId: string;
  rootWalletAddress: `0x${string}`;
  browserSigningWalletClient: ReturnType<typeof createWalletClient>;
}): Promise<void> {
  await runAgentCommand({
    baseUrl: input.baseUrl,
    webBaseUrl: input.webBaseUrl,
    threadId: input.threadId,
    runId: `${input.threadId}-hire`,
    command: {
      name: 'hire',
    },
  });

  const setupResult = await runAgentCommand({
    baseUrl: input.baseUrl,
    webBaseUrl: input.webBaseUrl,
    threadId: input.threadId,
    runId: `${input.threadId}-setup`,
    command: {
      resume: buildPortfolioManagerSetupInput(input.rootWalletAddress),
    },
  });
  let signingInterrupt = readPortfolioManagerSigningInterrupt(
    setupResult.snapshot,
    setupResult.events,
  );
  let setupSnapshot = setupResult.snapshot;
  let setupEvents = setupResult.events;
  if (!signingInterrupt) {
    const connectedSetup = await connectAgent({
      baseUrl: input.baseUrl,
      threadId: input.threadId,
      runId: `${input.threadId}-setup-connect`,
    });
    setupSnapshot = connectedSetup.snapshot;
    setupEvents = [...setupEvents, ...connectedSetup.events];
    signingInterrupt = readPortfolioManagerSigningInterrupt(
      connectedSetup.snapshot,
      connectedSetup.events,
    );
  }
  if (!signingInterrupt) {
    throw new Error(
      `Portfolio-manager setup did not emit a usable delegation-signing interrupt: ${truncateForLog(
        JSON.stringify({
          snapshot: setupSnapshot,
          events: setupEvents,
        }),
        2_000,
      )}`,
    );
  }
  if (signingInterrupt.delegatorAddress.toLowerCase() !== input.rootWalletAddress.toLowerCase()) {
    throw new Error(
      `Portfolio-manager requested signing from ${signingInterrupt.delegatorAddress} but smoke root is ${input.rootWalletAddress}.`,
    );
  }

  const signedDelegations: Array<UnsignedDelegation & { signature: `0x${string}` }> = [];
  for (const delegation of signingInterrupt.delegationsToSign) {
    const signature = await signRootDelegation({
      walletClient: input.browserSigningWalletClient,
      delegation,
      delegationManager: signingInterrupt.delegationManager,
      chainId: signingInterrupt.chainId,
      account: signingInterrupt.delegatorAddress,
    });
    signedDelegations.push({ ...delegation, signature });
  }

  const signingResult = await runAgentCommand({
    baseUrl: input.baseUrl,
    threadId: input.threadId,
    runId: `${input.threadId}-signing`,
    command: {
      resume: JSON.stringify({
        outcome: 'signed',
        signedDelegations,
      }),
    },
  });

  let signingSnapshot = signingResult.snapshot;
  let signingEvents = signingResult.events;
  if (
    !signingSnapshot &&
    !hasStateReplace({
      events: signingEvents,
      path: '/thread/lifecycle/phase',
      value: 'active',
    })
  ) {
    const connectedSigning = await connectAgent({
      baseUrl: input.baseUrl,
      threadId: input.threadId,
      runId: `${input.threadId}-signing-connect`,
    });
    signingSnapshot = connectedSigning.snapshot;
    signingEvents = [...signingEvents, ...connectedSigning.events];
  }

  const lifecycle = readSnapshotLifecycle(signingSnapshot);
  const reachedActive =
    (isRecord(lifecycle) && lifecycle['phase'] === 'active') ||
    hasStateReplace({
      events: signingEvents,
      path: '/thread/lifecycle/phase',
      value: 'active',
    });
  if (!reachedActive) {
    throw new Error(
      `Portfolio-manager onboarding did not complete: ${truncateForLog(
        JSON.stringify({
          snapshot: signingSnapshot,
          events: signingEvents,
        }),
        2_000,
      )}`,
    );
  }

  console.log(
    JSON.stringify({
      phase: 'portfolio-manager-onboarded',
      rootWalletAddress: input.rootWalletAddress,
      delegationCount: signedDelegations.length,
    }),
  );
}

async function updateManagedMandateForReservedSwap(input: {
  baseUrl: string;
  webBaseUrl: string;
  threadId: string;
  rootWalletAddress: `0x${string}`;
}): Promise<void> {
  await runAgentCommand({
    baseUrl: input.baseUrl,
    webBaseUrl: input.webBaseUrl,
    threadId: input.threadId,
    runId: `${input.threadId}-reserve-weth-mandate`,
    command: {
      name: 'update_managed_mandate',
      input: {
        targetAgentId: 'ember-lending',
        managedMandate: buildReservedWethManagedMandate(input.rootWalletAddress),
      },
    },
  });

  await runAgentCommand({
    baseUrl: input.baseUrl,
    webBaseUrl: input.webBaseUrl,
    threadId: input.threadId,
    runId: `${input.threadId}-refresh-after-reserve-weth-mandate`,
    command: {
      name: 'refresh_portfolio_state',
    },
  });

  console.log(
    JSON.stringify({
      phase: 'managed-mandate-updated-for-reserved-swap',
      rootWalletAddress: input.rootWalletAddress,
    }),
  );
}

async function main() {
  const baseUrl = resolvePortfolioManagerBaseUrl();
  const webBaseUrl = resolveWebBaseUrl();
  const identities = readIdentities();
  const rootAccount = privateKeyToAccount(identities.root_owner.private_key);
  const executorAccount = privateKeyToAccount(identities.subagent.private_key);
  const chainConfig = resolveChainConfig(rootAccount.address);
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(chainConfig.rpcUrl),
  });
  const walletClient = createWalletClient({
    account: rootAccount,
    chain: arbitrum,
    transport: http(chainConfig.rpcUrl),
  });
  const browserSigningWalletClient = createBrowserStyleSigningWalletClient(rootAccount);
  const fundingConfig = resolveFundingConfig(chainConfig);
  if (fundingConfig) {
    await ensureSmokeFunding(fundingConfig);
  }

  await ensureStateless7702Ready({
    publicClient,
    ownerWalletClient: walletClient,
    executorAccount,
    rootAddress: rootAccount.address,
    rpcUrl: chainConfig.rpcUrl,
  });
  const rootSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: rootAccount.address,
    signer: {
      walletClient,
    },
  });
  if (rootSmartAccount.address.toLowerCase() !== chainConfig.rootWalletAddress.toLowerCase()) {
    throw new Error(
      `Resolved root smart account ${rootSmartAccount.address} did not match smoke wallet ${chainConfig.rootWalletAddress}.`,
    );
  }
  const fundedWethBalance = await ensureRootSmartHasWeth({
    publicClient,
    walletClient,
    ownerAccount: rootAccount,
    rootSmartAccount,
    minimumBalance:
      fundingConfig?.minRootWeth ??
      parseUnits(process.env['PM_SWAP_SMOKE_MIN_ROOT_WETH'] ?? '0.001', 18),
  });

  const timestamp = Date.now();
  const portfolioThreadId = `pm-swap-smoke-${timestamp}`;
  const nonReservedPrompt =
    readString(process.env['PM_SWAP_SMOKE_NON_RESERVED_PROMPT']) ??
    `For wallet ${chainConfig.rootWalletAddress}, swap exactly 0.00010 WETH that is not reserved for USDC on Arbitrum. Use unassigned or unreserved capital only.`;
  const mixedPrompt =
    readString(process.env['PM_SWAP_SMOKE_MIXED_PROMPT']) ??
    `For wallet ${chainConfig.rootWalletAddress}, swap exactly 0.00010 WETH to USDC on Arbitrum using a mixed source: include some unreserved WETH and some WETH currently reserved for another agent. Do not use only one pool.`;
  const reservedPrompt =
    readString(process.env['PM_SWAP_SMOKE_RESERVED_PROMPT']) ??
    `For wallet ${chainConfig.rootWalletAddress}, swap exactly 0.00005 WETH from the WETH currently reserved for another agent to USDC on Arbitrum.`;
  const confirmPrompt = readString(process.env['PM_SWAP_SMOKE_CONFIRM_PROMPT']) ?? 'yes';

  console.log(
    JSON.stringify({
      phase: 'start',
      webBaseUrl,
      portfolioManagerBaseUrl: baseUrl,
      rootWalletAddress: chainConfig.rootWalletAddress,
      wethBalance: formatUnits(fundedWethBalance, 18),
      fundingEnabled: fundingConfig !== null,
    }),
  );

  await onboardPortfolioManagerThread({
    baseUrl,
    webBaseUrl,
    threadId: portfolioThreadId,
    rootWalletAddress: chainConfig.rootWalletAddress,
    browserSigningWalletClient,
  });

  const nonReservedBefore = await readSwapBalances({
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
  });
  const nonReservedResult = await runAgentMessage({
    baseUrl,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-unreserved-swap`,
    prompt: nonReservedPrompt,
  });
  const nonReservedProof = await assertActualSwapExecution({
    stage: 'non-reserved swap',
    result: nonReservedResult,
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
    before: nonReservedBefore,
  });
  console.log(
    JSON.stringify({
      phase: 'non-reserved-swap-complete',
      transactionHash: nonReservedProof.transactionHash,
      before: formatSwapBalances(nonReservedBefore),
      after: formatSwapBalances(nonReservedProof.balances),
      assistantText: truncateForLog(nonReservedResult.assistantText ?? ''),
    }),
  );

  await updateManagedMandateForReservedSwap({
    baseUrl,
    webBaseUrl,
    threadId: portfolioThreadId,
    rootWalletAddress: chainConfig.rootWalletAddress,
  });

  const mixedBefore = await readSwapBalances({
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
  });
  const mixedGateResult = await runAgentMessage({
    baseUrl,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-mixed-gate`,
    prompt: mixedPrompt,
  });
  assertReservedConfirmationGate('mixed swap confirmation gate', mixedGateResult);
  console.log(
    JSON.stringify({
      phase: 'mixed-confirmation-gate',
      assistantText: truncateForLog(mixedGateResult.assistantText ?? ''),
    }),
  );

  const mixedConfirmedResult = await runAgentMessage({
    baseUrl,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-mixed-confirmed`,
    prompt: confirmPrompt,
  });
  const mixedProof = await assertActualSwapExecution({
    stage: 'mixed swap confirmation',
    result: mixedConfirmedResult,
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
    before: mixedBefore,
  });
  console.log(
    JSON.stringify({
      phase: 'mixed-swap-complete',
      transactionHash: mixedProof.transactionHash,
      before: formatSwapBalances(mixedBefore),
      after: formatSwapBalances(mixedProof.balances),
      assistantText: truncateForLog(mixedConfirmedResult.assistantText ?? ''),
    }),
  );

  await updateManagedMandateForReservedSwap({
    baseUrl,
    webBaseUrl,
    threadId: portfolioThreadId,
    rootWalletAddress: chainConfig.rootWalletAddress,
  });

  const reservedBefore = await readSwapBalances({
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
  });
  const reservedGateResult = await runAgentMessage({
    baseUrl,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-reserved-gate`,
    prompt: reservedPrompt,
  });
  assertReservedConfirmationGate('reserved swap confirmation gate', reservedGateResult);
  console.log(
    JSON.stringify({
      phase: 'reserved-confirmation-gate',
      assistantText: truncateForLog(reservedGateResult.assistantText ?? ''),
    }),
  );

  const reservedConfirmedResult = await runAgentMessage({
    baseUrl,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-reserved-confirmed`,
    prompt: confirmPrompt,
  });
  const reservedProof = await assertActualSwapExecution({
    stage: 'reserved swap confirmation',
    result: reservedConfirmedResult,
    publicClient,
    walletAddress: chainConfig.rootWalletAddress,
    before: reservedBefore,
  });
  console.log(
    JSON.stringify({
      phase: 'reserved-swap-complete',
      transactionHash: reservedProof.transactionHash,
      before: formatSwapBalances(reservedBefore),
      after: formatSwapBalances(reservedProof.balances),
      assistantText: truncateForLog(reservedConfirmedResult.assistantText ?? ''),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
