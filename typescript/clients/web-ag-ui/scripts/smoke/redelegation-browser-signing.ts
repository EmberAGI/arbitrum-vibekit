import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { signDelegationWithFallback } from '../../apps/web/src/utils/delegationSigning.js';
import {
  parseDotEnvFile,
  startManagedSharedEmberHarness,
  startWorkspaceAgentServer,
} from './support/runtimePrep.js';

const WEB_PACKAGE_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/web/package.json',
);
const requireFromWeb = createRequire(WEB_PACKAGE_JSON_PATH);
const {
  Implementation,
  toMetaMaskSmartAccount,
} = requireFromWeb('@metamask/delegation-toolkit') as typeof import('@metamask/delegation-toolkit');
const { signDelegation: signDelegationWithToolkitAction } = requireFromWeb(
  '@metamask/delegation-toolkit/actions',
) as typeof import('@metamask/delegation-toolkit/actions');
const {
  custom,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseGwei,
  parseUnits,
} = requireFromWeb('viem') as typeof import('viem');
const { privateKeyToAccount } = requireFromWeb('viem/accounts') as typeof import('viem/accounts');
const { arbitrum } = requireFromWeb('viem/chains') as typeof import('viem/chains');
const { signAuthorization } = requireFromWeb('viem/experimental') as typeof import('viem/experimental');

type IdentityFile = {
  root_owner: {
    private_key: `0x${string}`;
  };
  subagent: {
    private_key: `0x${string}`;
  };
};

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

const ARBITRUM_RPC_URL = process.env['ARBITRUM_RPC_URL']?.trim() || 'https://arb1.arbitrum.io/rpc';
const CHAIN_ID = 42161;
const ROOT_SIGNING_MODE = (process.env['REDELEGATION_ROOT_SIGNING_MODE']?.trim() || 'app').toLowerCase();
const STACK_MODE = (process.env['REDELEGATION_STACK_MODE']?.trim() || 'selfboot').toLowerCase();
const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';
const EXTERNAL_SHARED_EMBER_BASE_URL =
  process.env['REDELEGATION_SHARED_EMBER_BASE_URL']?.trim() || 'http://127.0.0.1:4010';
const EXTERNAL_PORTFOLIO_MANAGER_BASE_URL =
  process.env['REDELEGATION_PORTFOLIO_MANAGER_BASE_URL']?.trim() || 'http://127.0.0.1:3420/ag-ui';
const EXTERNAL_LENDING_BASE_URL =
  process.env['REDELEGATION_LENDING_BASE_URL']?.trim() || 'http://127.0.0.1:3430/ag-ui';
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const;
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
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

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
  descriptions?: string[];
  warnings?: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
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

  const entries = readdirSync(worktreesRoot, { withFileTypes: true });
  const matchingDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === prefix || name.startsWith(`${prefix}-`));

  if (matchingDirs.length !== 1) {
    return null;
  }

  return path.join(worktreesRoot, matchingDirs[0]);
}

function resolveIdentitiesFilePath(): string {
  const explicitPath = process.env['REDELEGATION_IDENTITIES_PATH']?.trim();
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const explicitSpecRoot = process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT']?.trim();
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

  throw new Error(
    'Unable to resolve smoke.identities.local.json. Set REDELEGATION_IDENTITIES_PATH or EMBER_ORCHESTRATION_V1_SPEC_ROOT.',
  );
}

function readIdentities(): IdentityFile {
  return JSON.parse(readFileSync(resolveIdentitiesFilePath(), 'utf8')) as IdentityFile;
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

function parseEventStreamBody(body: string): unknown[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

function findStateSnapshot(events: unknown[]): AgUiSnapshot | null {
  const snapshot = [...events].reverse().find((event) => {
    return typeof event === 'object' && event !== null && 'type' in event && event.type === 'STATE_SNAPSHOT';
  });
  return (snapshot as AgUiSnapshot | undefined) ?? null;
}

async function readEventStreamUntilStateSnapshot(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return [] as unknown[];
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
        if (typeof event === 'object' && event !== null && 'type' in event && event.type === 'STATE_SNAPSHOT') {
          await reader.cancel();
          return events;
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  return events;
}

async function runAgentCommand(input: {
  baseUrl: string;
  agentId: string;
  threadId: string;
  runId: string;
  command: Record<string, unknown>;
}) {
  const response = await fetch(`${input.baseUrl}/agent/${input.agentId}/run`, {
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
      `${input.agentId} run failed with HTTP ${response.status}: ${await response.text()}`,
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
  agentId: string;
  threadId: string;
  runId: string;
}) {
  const controller = new AbortController();
  const response = await fetch(`${input.baseUrl}/agent/${input.agentId}/connect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    signal: controller.signal,
    body: JSON.stringify({
      threadId: input.threadId,
      runId: input.runId,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${input.agentId} connect failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const events = await readEventStreamUntilStateSnapshot(response);
  controller.abort();
  return {
    events,
    snapshot: findStateSnapshot(events),
  };
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

function readInterruptPayloadFromUnknown(
  value: unknown,
  interruptType: string,
): DelegationSigningInterruptPayload | null {
  const candidate =
    typeof value === 'string' ? parseJsonMaybe<Record<string, unknown>>(value) : value;
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const type = readString((candidate as { type?: unknown }).type);
  if (type !== interruptType) {
    return null;
  }

  const chainId = (candidate as { chainId?: unknown }).chainId;
  const delegationManager = readString(
    (candidate as { delegationManager?: unknown }).delegationManager,
  ) as `0x${string}` | null;
  const delegatorAddress = readString(
    (candidate as { delegatorAddress?: unknown }).delegatorAddress,
  ) as `0x${string}` | null;
  const delegateeAddress = readString(
    (candidate as { delegateeAddress?: unknown }).delegateeAddress,
  ) as `0x${string}` | null;
  const delegationsToSign = (candidate as { delegationsToSign?: unknown }).delegationsToSign;

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
    descriptions: Array.isArray((candidate as { descriptions?: unknown }).descriptions)
      ? ((candidate as { descriptions?: unknown[] }).descriptions as string[])
      : [],
    warnings: Array.isArray((candidate as { warnings?: unknown }).warnings)
      ? ((candidate as { warnings?: unknown[] }).warnings as string[])
      : [],
  };
}

function readPortfolioManagerSigningInterrupt(
  snapshot: AgUiSnapshot | null,
): DelegationSigningInterruptPayload | null {
  const currentArtifact = readSnapshotArtifact(snapshot);
  if (
    typeof currentArtifact === 'object' &&
    currentArtifact !== null &&
    (currentArtifact as { type?: unknown }).type === 'interrupt-status'
  ) {
    const interruptPayload = readInterruptPayloadFromUnknown(
      (currentArtifact as { payload?: unknown }).payload,
      'portfolio-manager-delegation-signing-request',
    );
    if (interruptPayload) {
      return interruptPayload;
    }
  }

  for (const event of readSnapshotActivityEvents(snapshot)) {
    const parts = (event as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (typeof part !== 'object' || part === null) {
        continue;
      }

      const kind = (part as { kind?: unknown }).kind;
      if (kind !== 'a2ui') {
        continue;
      }

      const data = (part as { data?: unknown }).data;
      if (typeof data !== 'object' || data === null) {
        continue;
      }

      const payload = (data as { payload?: unknown }).payload;
      if (typeof payload !== 'object' || payload === null) {
        continue;
      }

      const interruptEnvelopeKind = readString((payload as { kind?: unknown }).kind);
      const maybeInterrupt =
        interruptEnvelopeKind === 'interrupt'
          ? (payload as { payload?: unknown }).payload
          : payload;
      const interruptPayload = readInterruptPayloadFromUnknown(
        maybeInterrupt,
        'portfolio-manager-delegation-signing-request',
      );
      if (interruptPayload) {
        return interruptPayload;
      }
    }
  }

  for (const interruptValue of readSnapshotTaskInterrupts(snapshot)) {
    const interruptPayload = readInterruptPayloadFromUnknown(
      interruptValue,
      'portfolio-manager-delegation-signing-request',
    );
    if (interruptPayload) {
      return interruptPayload;
    }
  }

  return null;
}

async function ensureStateless7702Ready(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  ownerWalletClient: ReturnType<typeof createWalletClient>;
  executorAccount: ReturnType<typeof privateKeyToAccount>;
  rootAddress: `0x${string}`;
}) {
  const currentCode = await input.publicClient.getCode({ address: input.rootAddress });
  if (currentCode && currentCode !== '0x') {
    return input.rootAddress;
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
    transport: http(ARBITRUM_RPC_URL),
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

  return input.rootAddress;
}

async function ensureRootSmartHasWeth(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  ownerAccount: ReturnType<typeof privateKeyToAccount>;
  rootSmartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
}) {
  const minimumBalance = parseUnits('0.00001', 18);
  const currentBalance = await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.rootSmartAccount.address],
  });

  if (currentBalance >= minimumBalance) {
    return currentBalance;
  }

  if (input.ownerAccount.address.toLowerCase() === input.rootSmartAccount.address.toLowerCase()) {
    const depositAmount = minimumBalance - currentBalance;
    if (depositAmount > 0n) {
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
    }

    return await input.publicClient.readContract({
      address: WETH,
      abi: WETH_ABI,
      functionName: 'balanceOf',
      args: [input.rootSmartAccount.address],
    });
  }

  const ownerBalance = await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.ownerAccount.address],
  });

  const depositAmount = minimumBalance - currentBalance - ownerBalance;
  if (depositAmount > 0n) {
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
  }

  const transferAmount = minimumBalance - currentBalance;
  const transferHash = await input.walletClient.sendTransaction({
    account: input.ownerAccount,
    to: WETH,
    value: 0n,
    data: encodeFunctionData({
      abi: WETH_ABI,
      functionName: 'transfer',
      args: [input.rootSmartAccount.address, transferAmount],
    }),
  });
  await input.publicClient.waitForTransactionReceipt({ hash: transferHash });

  return await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.rootSmartAccount.address],
  });
}

function buildPortfolioManagerSetupInput(walletAddress: `0x${string}`) {
  return {
    walletAddress,
    portfolioMandate: {
      approved: true,
      riskLevel: 'medium',
    },
    managedAgentMandates: [
      {
        agentKey: 'ember-lending-primary',
        agentType: 'ember-lending',
        approved: true,
        settings: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['WETH'],
          allowedBorrowAssets: ['USDC'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
      },
    ],
  };
}

function readTransactionHash(snapshot: AgUiSnapshot | null) {
  const lifecycle = readSnapshotLifecycle(snapshot) as Record<string, unknown> | null;
  const transactionHash = lifecycle?.['lastExecutionTxHash'];
  return typeof transactionHash === 'string' ? transactionHash : null;
}

function readExpectedMandateRef(snapshot: AgUiSnapshot | null) {
  const lifecycle = readSnapshotLifecycle(snapshot) as Record<string, unknown> | null;
  const onboardingBootstrap = lifecycle?.['lastOnboardingBootstrap'] as
    | Record<string, unknown>
    | null
    | undefined;
  const activation = onboardingBootstrap?.['activation'] as Record<string, unknown> | null | undefined;
  return readString(activation?.['mandateRef']);
}

async function waitForLendingHydration(input: {
  baseUrl: string;
  threadId: string;
  rootUserWallet: `0x${string}`;
  expectedMandateRef: string;
}) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const connectResult = await connectAgent({
      baseUrl: input.baseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: input.threadId,
      runId: `${input.threadId}-connect-${attempt}`,
    });
    const lifecycle = readSnapshotLifecycle(connectResult.snapshot) as Record<string, unknown> | null;
    const rootUserWalletAddress = readString(lifecycle?.['rootUserWalletAddress']);
    const mandateRef = readString(lifecycle?.['mandateRef']);
    const walletAddress = readString(lifecycle?.['walletAddress']);
    const reservationSummary = readString(lifecycle?.['lastReservationSummary']);

    if (
      lifecycle?.['phase'] === 'active' &&
      rootUserWalletAddress?.toLowerCase() === input.rootUserWallet.toLowerCase() &&
      mandateRef === input.expectedMandateRef &&
      walletAddress &&
      reservationSummary
    ) {
      return connectResult;
    }

    await sleep(500);
  }

  throw new Error('Timed out waiting for ember-lending to hydrate execution context through AG-UI.');
}

async function signRootDelegation(input: {
  walletClient: ReturnType<typeof createWalletClient>;
  delegation: UnsignedDelegation;
  delegationManager: `0x${string}`;
  chainId: number;
  account: `0x${string}`;
}) {
  if (ROOT_SIGNING_MODE === 'toolkit') {
    return await signDelegationWithToolkitAction(input.walletClient, {
      delegation: input.delegation,
      delegationManager: input.delegationManager,
      chainId: input.chainId,
      account: input.account,
      allowInsecureUnrestrictedDelegation: true,
    });
  }

  if (ROOT_SIGNING_MODE === 'app') {
    return await signDelegationWithFallback({
      walletClient: input.walletClient,
      delegation: input.delegation,
      delegationManager: input.delegationManager,
      chainId: input.chainId,
      account: input.account,
    });
  }

  throw new Error(
    `Unsupported REDELEGATION_ROOT_SIGNING_MODE "${ROOT_SIGNING_MODE}". Expected "app" or "toolkit".`,
  );
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const webAgUiRoot = path.resolve(scriptDir, '../..');
  const vibekitRoot = path.resolve(webAgUiRoot, '../../..');
  const specRoot =
    process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT']?.trim() ||
    resolveSingleWorktree('ember-orchestration-v1-spec');
  if (!specRoot) {
    throw new Error(
      'Unable to resolve ember-orchestration-v1-spec worktree. Set EMBER_ORCHESTRATION_V1_SPEC_ROOT.',
    );
  }

  const sharedEmber =
    STACK_MODE === 'selfboot'
      ? await startManagedSharedEmberHarness({
          specRoot,
          vibekitRoot,
        })
      : null;
  let portfolioManagerServer: Awaited<ReturnType<typeof startWorkspaceAgentServer>> | null = null;
  let lendingServer: Awaited<ReturnType<typeof startWorkspaceAgentServer>> | null = null;
  const externalPortfolioManagerBaseUrl =
    STACK_MODE === 'selfboot' ? null : EXTERNAL_PORTFOLIO_MANAGER_BASE_URL;
  const externalLendingBaseUrl = STACK_MODE === 'selfboot' ? null : EXTERNAL_LENDING_BASE_URL;

  try {
    if (STACK_MODE === 'selfboot') {
      const portfolioManagerEnv = {
        ...parseDotEnvFile(path.join(webAgUiRoot, 'apps/agent-portfolio-manager/.env')),
        ...process.env,
        SHARED_EMBER_BASE_URL: sharedEmber!.baseUrl,
      };
      portfolioManagerServer = await startWorkspaceAgentServer({
        cwd: path.join(webAgUiRoot, 'apps/agent-portfolio-manager'),
        env: portfolioManagerEnv,
        label: 'agent-portfolio-manager',
        basePath: '/ag-ui',
      });

      const lendingEnv = {
        ...parseDotEnvFile(path.join(webAgUiRoot, 'apps/agent-ember-lending/.env')),
        ...process.env,
        SHARED_EMBER_BASE_URL: sharedEmber!.baseUrl,
      };
      lendingServer = await startWorkspaceAgentServer({
        cwd: path.join(webAgUiRoot, 'apps/agent-ember-lending'),
        env: lendingEnv,
        label: 'agent-ember-lending',
        basePath: '/ag-ui',
      });
    }

    const portfolioManagerBaseUrl =
      portfolioManagerServer?.baseUrl ?? externalPortfolioManagerBaseUrl;
    const lendingBaseUrl = lendingServer?.baseUrl ?? externalLendingBaseUrl;
    if (!portfolioManagerBaseUrl || !lendingBaseUrl) {
      throw new Error(
        `Unable to resolve agent base URLs for stack mode "${STACK_MODE}".`,
      );
    }

  const identities = readIdentities();
  const rootAccount = privateKeyToAccount(identities.root_owner.private_key);
  const executorAccount = privateKeyToAccount(identities.subagent.private_key);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(ARBITRUM_RPC_URL),
  });
  const walletClient = createWalletClient({
    account: rootAccount,
    chain: arbitrum,
    transport: http(ARBITRUM_RPC_URL),
  });
  const browserSigningWalletClient = createBrowserStyleSigningWalletClient(rootAccount);

  await ensureStateless7702Ready({
    publicClient,
    ownerWalletClient: walletClient,
    executorAccount,
    rootAddress: rootAccount.address,
  });

  const rootSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: rootAccount.address,
    signer: {
      walletClient,
    },
  });

  const fundedWethBalance = await ensureRootSmartHasWeth({
    publicClient,
    walletClient,
    ownerAccount: rootAccount,
    rootSmartAccount,
  });

  const nonce = Date.now().toString(36);
  const portfolioThreadId = `pm-browser-smoke-${nonce}`;
  const lendingThreadId = `lend-browser-smoke-${nonce}`;

  console.log(
    JSON.stringify(
      {
        phase: 'bootstrap',
        stackMode: STACK_MODE,
        startupMode: 'self-booted-shared-ember-plus-production-agent-startup',
        registrationMode: 'agent-src-server-startup-preflight',
        rootSigningMode: ROOT_SIGNING_MODE,
        sharedEmberBaseUrl: sharedEmber?.baseUrl ?? EXTERNAL_SHARED_EMBER_BASE_URL,
        portfolioManagerBaseUrl,
        lendingBaseUrl,
        rootMode: 'stateless7702-browser-signing',
        rootOwnerWallet: rootAccount.address,
        rootSmartWallet: rootSmartAccount.address,
        wethBalance: fundedWethBalance.toString(),
      },
      null,
      2,
    ),
  );

  await runAgentCommand({
    baseUrl: portfolioManagerBaseUrl,
    agentId: PORTFOLIO_MANAGER_AGENT_ID,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-hire`,
    command: {
      name: 'hire',
    },
  });

  const setupResult = await runAgentCommand({
    baseUrl: portfolioManagerBaseUrl,
    agentId: PORTFOLIO_MANAGER_AGENT_ID,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-setup`,
    command: {
      resume: JSON.stringify(buildPortfolioManagerSetupInput(rootSmartAccount.address)),
    },
  });
  const signingInterrupt = readPortfolioManagerSigningInterrupt(setupResult.snapshot);
  if (!signingInterrupt) {
    throw new Error(
      `Portfolio-manager setup did not emit a usable delegation-signing interrupt: ${JSON.stringify(setupResult.snapshot, null, 2)}`,
    );
  }
  if (signingInterrupt.delegatorAddress.toLowerCase() !== rootSmartAccount.address.toLowerCase()) {
    throw new Error(
      `Portfolio-manager requested signing from ${signingInterrupt.delegatorAddress} but smoke root is ${rootSmartAccount.address}.`,
    );
  }

  const signedRootDelegations: Array<UnsignedDelegation & { signature: `0x${string}` }> = [];
  for (const delegation of signingInterrupt.delegationsToSign) {
    const signature = await signRootDelegation({
      walletClient: browserSigningWalletClient,
      delegation,
      delegationManager: signingInterrupt.delegationManager,
      chainId: signingInterrupt.chainId,
      account: signingInterrupt.delegatorAddress,
    });
    signedRootDelegations.push({ ...delegation, signature });
  }

  console.log(
    JSON.stringify(
      {
        phase: 'signing-request',
        delegatorAddress: signingInterrupt.delegatorAddress,
        delegateeAddress: signingInterrupt.delegateeAddress,
        delegationManager: signingInterrupt.delegationManager,
        delegationCount: signingInterrupt.delegationsToSign.length,
      },
      null,
      2,
    ),
  );

  const signingResult = await runAgentCommand({
    baseUrl: portfolioManagerBaseUrl,
    agentId: PORTFOLIO_MANAGER_AGENT_ID,
    threadId: portfolioThreadId,
    runId: `${portfolioThreadId}-signing`,
    command: {
      resume: JSON.stringify({
        outcome: 'signed',
        signedDelegations: signedRootDelegations,
      }),
    },
  });
  const signingLifecycle = readSnapshotLifecycle(signingResult.snapshot) as
    | Record<string, unknown>
    | null;
  if (signingLifecycle?.['phase'] !== 'active') {
    throw new Error(
      `Portfolio-manager onboarding did not complete: ${JSON.stringify(signingResult.snapshot)}`,
    );
  }
  const expectedMandateRef = readExpectedMandateRef(signingResult.snapshot);
  if (!expectedMandateRef) {
    throw new Error(
      `Portfolio-manager onboarding did not expose an activation mandate ref: ${JSON.stringify(signingResult.snapshot)}`,
    );
  }

  const connectResult = await waitForLendingHydration({
    baseUrl: lendingBaseUrl,
    threadId: lendingThreadId,
    rootUserWallet: rootSmartAccount.address,
    expectedMandateRef,
  });
  const connectLifecycle = readSnapshotLifecycle(connectResult.snapshot) as Record<string, unknown> | null;
  console.log(
    JSON.stringify(
      {
        phase: 'onboarded',
        rootUserWalletAddress: readString(connectLifecycle?.['rootUserWalletAddress']),
        subagentWalletAddress: readString(connectLifecycle?.['walletAddress']),
        rootedWalletContextId: readString(connectLifecycle?.['rootedWalletContextId']),
        mandateRef: readString(connectLifecycle?.['mandateRef']),
      },
      null,
      2,
    ),
  );

  const planResult = await runAgentCommand({
    baseUrl: lendingBaseUrl,
    agentId: EMBER_LENDING_AGENT_ID,
    threadId: lendingThreadId,
    runId: `${lendingThreadId}-plan`,
    command: {
      name: 'create_transaction_plan',
    },
  });
  console.log(
    JSON.stringify(
      {
        phase: 'planned',
        candidatePlanArtifact: readSnapshotArtifact(planResult.snapshot),
      },
      null,
      2,
    ),
  );

  let finalExecution: { snapshot: AgUiSnapshot | null } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const executionPromise = runAgentCommand({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-execute-${attempt}`,
      command: {
        name: 'request_transaction_execution',
      },
    });

    await sleep(100);
    const refreshResult = await runAgentCommand({
      baseUrl: portfolioManagerBaseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: portfolioThreadId,
      runId: `${portfolioThreadId}-refresh-${attempt}`,
      command: {
        name: 'refresh_redelegation_work',
      },
    });
    const executionResult = await executionPromise;

    console.log(
      JSON.stringify(
        {
          phase: 'attempt',
          attempt,
          portfolioRefresh: {
            lifecycle: readSnapshotLifecycle(refreshResult.snapshot),
            artifact: readSnapshotArtifact(refreshResult.snapshot),
          },
          lendingExecution: {
            lifecycle: readSnapshotLifecycle(executionResult.snapshot),
            artifact: readSnapshotArtifact(executionResult.snapshot),
          },
        },
        null,
        2,
      ),
    );

    if (readTransactionHash(executionResult.snapshot)) {
      finalExecution = executionResult;
      break;
    }

    finalExecution = executionResult;
    await sleep(250);
  }

  const transactionHash = readTransactionHash(finalExecution?.snapshot ?? null);
  if (!transactionHash) {
    throw new Error(
      `Execution did not confirm after retries. Final snapshot: ${JSON.stringify(finalExecution?.snapshot, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        phase: 'completed',
        transactionHash,
        artifact: readSnapshotArtifact(finalExecution?.snapshot ?? null),
      },
      null,
      2,
    ),
  );
  } finally {
    await lendingServer?.close().catch(() => undefined);
    await portfolioManagerServer?.close().catch(() => undefined);
    await sharedEmber?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
