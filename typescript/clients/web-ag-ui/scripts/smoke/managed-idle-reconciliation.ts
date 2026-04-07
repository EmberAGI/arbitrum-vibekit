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
      artifacts?: {
        current?: {
          data?: unknown;
        } | null;
      } | null;
      activity?: {
        events?: unknown[];
      } | null;
    } | null;
    tasks?: Array<{
      interrupts?: Array<{
        value?: unknown;
      }>;
    }> | null;
  } | null;
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

type PortfolioReservation = {
  reservationId: string;
  controlPath: string | null;
  status: string | null;
  unitAllocations: Array<{
    unitId: string;
    quantity: string;
  }>;
};

type PortfolioOwnedUnit = {
  unitId: string;
  rootAsset: string | null;
  quantity: string | null;
  status: string | null;
  controlPath: string | null;
  reservationId: string | null;
};

type PortfolioReadResult = {
  revision: number | null;
  portfolioState: Record<string, unknown> | null;
};

type OnboardingReadResult = {
  revision: number | null;
  onboardingState: Record<string, unknown> | null;
};

const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';
const CHAIN_ID = 42161;
const ARBITRUM_RPC_URL =
  process.env['ARBITRUM_RPC_URL']?.trim() || 'https://arb1.arbitrum.io/rpc';
const STACK_MODE = (process.env['RECONCILIATION_STACK_MODE']?.trim() || 'selfboot').toLowerCase();
const EXTERNAL_SHARED_EMBER_BASE_URL =
  process.env['RECONCILIATION_SHARED_EMBER_BASE_URL']?.trim() || 'http://127.0.0.1:4010';
const EXTERNAL_PORTFOLIO_MANAGER_BASE_URL =
  process.env['RECONCILIATION_PORTFOLIO_MANAGER_BASE_URL']?.trim() || 'http://127.0.0.1:3420/ag-ui';
const EXTERNAL_LENDING_BASE_URL =
  process.env['RECONCILIATION_LENDING_BASE_URL']?.trim() || 'http://127.0.0.1:3430/ag-ui';
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const;
const MIN_ROOT_WETH = parseUnits('0.00008', 18);
const EGRESS_AMOUNT = parseUnits('0.00001', 18);
const INGRESS_AMOUNT = EGRESS_AMOUNT;
const ROOT_ETH_GAS_RESERVE = parseUnits('0.00005', 18);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  const matches = readdirSync(worktreesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === prefix || name.startsWith(`${prefix}-`));

  if (matches.length !== 1) {
    return null;
  }

  return path.join(worktreesRoot, matches[0]!);
}

function resolveIdentitiesFilePath(): string {
  const explicitPath = process.env['RECONCILIATION_IDENTITIES_PATH']?.trim();
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
    'Unable to resolve smoke.identities.local.json. Set RECONCILIATION_IDENTITIES_PATH or EMBER_ORCHESTRATION_V1_SPEC_ROOT.',
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

      throw new Error(`Unsupported browser signing method: ${method}`);
    },
  };

  return createWalletClient({
    account: account.address,
    chain: arbitrum,
    transport: custom(provider),
  });
}

async function postJsonRpc<TResult>(input: {
  baseUrl: string;
  method: string;
  params: Record<string, unknown>;
}): Promise<TResult> {
  const response = await fetch(`${input.baseUrl}/jsonrpc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `smoke-${input.method}`,
      method: input.method,
      params: input.params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shared Ember HTTP request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as {
    result?: TResult;
    error?: {
      message?: string;
    };
  };
  if (body.error?.message) {
    throw new Error(`Shared Ember JSON-RPC error: ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new Error(`Shared Ember JSON-RPC response for ${input.method} was missing result.`);
  }

  return body.result;
}

function parseEventStreamBody(body: string): unknown[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

function findStateSnapshot(events: unknown[]): AgUiSnapshot | null {
  const snapshot = [...events].reverse().find(
    (event) =>
      typeof event === 'object' && event !== null && 'type' in event && event.type === 'STATE_SNAPSHOT',
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
    .map((part) => {
      if (!isRecord(part)) {
        return null;
      }

      return part['type'] === 'text' ? readString(part['text']) : null;
    })
    .filter((part): part is string => part !== null)
    .join('');

  return text.trim().length > 0 ? text : null;
}

function readLatestAssistantText(events: unknown[]): string | null {
  const messagesSnapshot = findMessagesSnapshotEvent(events);
  const messages = messagesSnapshot?.['messages'];
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
        if (
          typeof event === 'object' &&
          event !== null &&
          'type' in event &&
          event.type === 'STATE_SNAPSHOT'
        ) {
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

async function runAgentMessage(input: {
  baseUrl: string;
  agentId: string;
  threadId: string;
  runId: string;
  prompt: string;
}) {
  const response = await fetch(`${input.baseUrl}/agent/${input.agentId}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
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
      `${input.agentId} message run failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const events = parseEventStreamBody(await response.text());
  return {
    events,
    snapshot: findStateSnapshot(events),
    assistantText: readLatestAssistantText(events),
  };
}

function readSnapshotLifecycle(snapshot: AgUiSnapshot | null) {
  return snapshot?.snapshot?.thread?.lifecycle ?? null;
}

function readSnapshotArtifact(snapshot: AgUiSnapshot | null) {
  return snapshot?.snapshot?.thread?.artifacts?.current?.data ?? null;
}

function readLifecycleExecutionTxHash(snapshot: AgUiSnapshot | null) {
  const lifecycle = readSnapshotLifecycle(snapshot);
  return isRecord(lifecycle) ? readString(lifecycle['lastExecutionTxHash']) : null;
}

function readLifecycleCandidateUnitIds(snapshot: AgUiSnapshot | null): string[] {
  const lifecycle = readSnapshotLifecycle(snapshot);
  if (!isRecord(lifecycle) || !isRecord(lifecycle['lastCandidatePlan'])) {
    return [];
  }

  const handoff = lifecycle['lastCandidatePlan'];
  const candidateUnitIds = isRecord(handoff) && Array.isArray(handoff['candidate_unit_ids'])
    ? handoff['candidate_unit_ids']
    : isRecord(handoff) && isRecord(handoff['handoff']) && Array.isArray(handoff['handoff']['candidate_unit_ids'])
      ? handoff['handoff']['candidate_unit_ids']
      : [];

  return candidateUnitIds
    .map((candidate) => readString(candidate))
    .filter((candidate): candidate is string => candidate !== null);
}

function requireAssistantText(text: string | null, stage: string) {
  if (text) {
    return text;
  }

  throw new Error(`${stage} did not produce a readable assistant message.`);
}

function truncateForLog(text: string, maxLength = 280) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
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
  };
}

function readPortfolioManagerSigningInterrupt(
  snapshot: AgUiSnapshot | null,
): DelegationSigningInterruptPayload | null {
  const artifact = readSnapshotArtifact(snapshot);
  if (
    typeof artifact === 'object' &&
    artifact !== null &&
    (artifact as { type?: unknown }).type === 'interrupt-status'
  ) {
    const payload = (artifact as { payload?: unknown }).payload;
    const interrupt = readInterruptPayloadFromUnknown(
      typeof payload === 'object' && payload !== null && (payload as { kind?: unknown }).kind === 'interrupt'
        ? (payload as { payload?: unknown }).payload
        : payload,
      'portfolio-manager-delegation-signing-request',
    );
    if (interrupt) {
      return interrupt;
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

      const maybeInterrupt =
        readString((payload as { kind?: unknown }).kind) === 'interrupt'
          ? (payload as { payload?: unknown }).payload
          : payload;
      const interrupt = readInterruptPayloadFromUnknown(
        maybeInterrupt,
        'portfolio-manager-delegation-signing-request',
      );
      if (interrupt) {
        return interrupt;
      }
    }
  }

  for (const interruptValue of readSnapshotTaskInterrupts(snapshot)) {
    const interrupt = readInterruptPayloadFromUnknown(
      interruptValue,
      'portfolio-manager-delegation-signing-request',
    );
    if (interrupt) {
      return interrupt;
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
  return input.rootAddress;
}

async function ensureEthBalance(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  sourceWalletClient: ReturnType<typeof createWalletClient>;
  sourceAccount: ReturnType<typeof privateKeyToAccount>;
  targetAddress: `0x${string}`;
  minimumBalance: bigint;
}) {
  const currentBalance = await input.publicClient.getBalance({
    address: input.targetAddress,
  });

  if (currentBalance >= input.minimumBalance) {
    return currentBalance;
  }

  const transferHash = await input.sourceWalletClient.sendTransaction({
    account: input.sourceAccount,
    to: input.targetAddress,
    value: input.minimumBalance - currentBalance,
    chain: arbitrum,
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });
  await input.publicClient.waitForTransactionReceipt({ hash: transferHash });
  return await input.publicClient.getBalance({ address: input.targetAddress });
}

async function ensureWethBalance(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  fundingWalletClient: ReturnType<typeof createWalletClient>;
  fundingAccount: ReturnType<typeof privateKeyToAccount>;
  targetWalletClient: ReturnType<typeof createWalletClient>;
  targetAccount: ReturnType<typeof privateKeyToAccount>;
  targetAddress: `0x${string}`;
  minimumBalance: bigint;
}) {
  const currentBalance = await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.targetAddress],
  });
  if (currentBalance >= input.minimumBalance) {
    return currentBalance;
  }

  const deficit = input.minimumBalance - currentBalance;
  if (input.fundingAccount.address.toLowerCase() !== input.targetAddress.toLowerCase()) {
    const currentEthBalance = await input.publicClient.getBalance({
      address: input.targetAddress,
    });
    await ensureEthBalance({
      publicClient: input.publicClient,
      sourceWalletClient: input.fundingWalletClient,
      sourceAccount: input.fundingAccount,
      targetAddress: input.targetAddress,
      minimumBalance: deficit + ROOT_ETH_GAS_RESERVE > currentEthBalance ? deficit + ROOT_ETH_GAS_RESERVE : currentEthBalance,
    });
  }

  const targetDepositHash = await input.targetWalletClient.sendTransaction({
    account: input.targetAccount,
    to: WETH,
    value: deficit,
    data: encodeFunctionData({
      abi: WETH_ABI,
      functionName: 'deposit',
    }),
    chain: arbitrum,
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });
  await input.publicClient.waitForTransactionReceipt({ hash: targetDepositHash });

  return await input.publicClient.readContract({
    address: WETH,
    abi: WETH_ABI,
    functionName: 'balanceOf',
    args: [input.targetAddress],
  });
}

async function transferWeth(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: ReturnType<typeof privateKeyToAccount>;
  to: `0x${string}`;
  amount: bigint;
}) {
  const hash = await input.walletClient.sendTransaction({
    account: input.account,
    to: WETH,
    value: 0n,
    data: encodeFunctionData({
      abi: WETH_ABI,
      functionName: 'transfer',
      args: [input.to, input.amount],
    }),
    chain: arbitrum,
    maxFeePerGas: parseGwei('0.1'),
    maxPriorityFeePerGas: parseGwei('0.01'),
  });
  await input.publicClient.waitForTransactionReceipt({ hash });
  return hash;
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
          allowedBorrowAssets: ['WETH'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
      },
    ],
  };
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
    if (
      lifecycle?.['phase'] === 'active' &&
      rootUserWalletAddress?.toLowerCase() === input.rootUserWallet.toLowerCase() &&
      mandateRef === input.expectedMandateRef &&
      walletAddress
    ) {
      return connectResult;
    }

    await sleep(500);
  }

  throw new Error('Timed out waiting for lending hydration.');
}

async function fetchPortfolioState(input: {
  sharedEmberBaseUrl: string;
}): Promise<PortfolioReadResult> {
  const result = await postJsonRpc<{
    revision?: number;
    portfolio_state?: unknown;
  }>({
    baseUrl: input.sharedEmberBaseUrl,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: 'ember-lending',
    },
  });

  return {
    revision: typeof result.revision === 'number' ? result.revision : null,
    portfolioState:
      typeof result.portfolio_state === 'object' && result.portfolio_state !== null
        ? (result.portfolio_state as Record<string, unknown>)
        : null,
  };
}

async function fetchOnboardingState(input: {
  sharedEmberBaseUrl: string;
  walletAddress: `0x${string}`;
}): Promise<OnboardingReadResult> {
  const result = await postJsonRpc<{
    revision?: number;
    onboarding_state?: unknown;
  }>({
    baseUrl: input.sharedEmberBaseUrl,
    method: 'orchestrator.readOnboardingState.v1',
    params: {
      agent_id: 'ember-lending',
      wallet_address: input.walletAddress,
      network: 'arbitrum',
    },
  });

  return {
    revision: typeof result.revision === 'number' ? result.revision : null,
    onboardingState:
      typeof result.onboarding_state === 'object' && result.onboarding_state !== null
        ? (result.onboarding_state as Record<string, unknown>)
        : null,
  };
}

function readPortfolioReservations(portfolioState: Record<string, unknown> | null): PortfolioReservation[] {
  const reservations = portfolioState?.['reservations'];
  if (!Array.isArray(reservations)) {
    return [];
  }

  return reservations
    .map((candidate) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return null;
      }

      const reservation = candidate as Record<string, unknown>;
      const reservationId = readString(reservation['reservation_id']);
      if (!reservationId) {
        return null;
      }

      return {
        reservationId,
        controlPath: readString(reservation['control_path']),
        status: readString(reservation['status']),
        unitAllocations: Array.isArray(reservation['unit_allocations'])
          ? reservation['unit_allocations']
              .map((allocation) => {
                if (typeof allocation !== 'object' || allocation === null) {
                  return null;
                }

                const record = allocation as Record<string, unknown>;
                const unitId = readString(record['unit_id']);
                const quantity = readString(record['quantity']);
                return unitId && quantity ? { unitId, quantity } : null;
              })
              .filter(
                (
                  allocation,
                ): allocation is {
                  unitId: string;
                  quantity: string;
                } => allocation !== null,
              )
          : [],
      } satisfies PortfolioReservation;
    })
    .filter((reservation): reservation is PortfolioReservation => reservation !== null);
}

function readPortfolioOwnedUnits(portfolioState: Record<string, unknown> | null): PortfolioOwnedUnit[] {
  const ownedUnits = portfolioState?.['owned_units'];
  if (!Array.isArray(ownedUnits)) {
    return [];
  }

  return ownedUnits
    .map((candidate) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return null;
      }

      const unit = candidate as Record<string, unknown>;
      const unitId = readString(unit['unit_id']);
      if (!unitId) {
        return null;
      }

      return {
        unitId,
        rootAsset: readString(unit['root_asset']),
        quantity: readString(unit['quantity']),
        status: readString(unit['status']),
        controlPath: readString(unit['control_path']),
        reservationId: readString(unit['reservation_id']),
      } satisfies PortfolioOwnedUnit;
    })
    .filter((unit): unit is PortfolioOwnedUnit => unit !== null);
}

function readActiveReservationByControlPath(
  portfolioState: Record<string, unknown> | null,
  controlPath: string,
) {
  return (
    readPortfolioReservations(portfolioState).find(
      (reservation) =>
        reservation.status === 'active' && reservation.controlPath === controlPath,
    ) ?? null
  );
}

function readReservationQuantity(
  portfolioState: Record<string, unknown> | null,
  controlPath: string,
) {
  const reservation = readActiveReservationByControlPath(portfolioState, controlPath);
  if (!reservation) {
    return null;
  }

  return reservation.unitAllocations.reduce((sum, allocation) => sum + BigInt(allocation.quantity), 0n);
}

function readWethCoverageFingerprint(portfolioState: Record<string, unknown> | null) {
  const wethUnits = readPortfolioOwnedUnits(portfolioState)
    .filter((unit) => unit.rootAsset === 'WETH')
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  const activeSupplyReservation = readActiveReservationByControlPath(
    portfolioState,
    'lending.supply',
  );

  return JSON.stringify({
    wethUnits,
    activeSupplyReservation:
      activeSupplyReservation === null
        ? null
        : {
            reservationId: activeSupplyReservation.reservationId,
            controlPath: activeSupplyReservation.controlPath,
            status: activeSupplyReservation.status,
            unitAllocations: [...activeSupplyReservation.unitAllocations].sort((left, right) =>
              left.unitId.localeCompare(right.unitId),
            ),
          },
  });
}

function readOwnedUnitIdByControlPath(
  portfolioState: Record<string, unknown> | null,
  controlPath: string,
) {
  return (
    readPortfolioOwnedUnits(portfolioState).find((unit) => unit.controlPath === controlPath)?.unitId ??
    null
  );
}

function buildFollowUpPlanningInput(input: {
  reservation: PortfolioReservation;
  intent: 'unwind';
  actionSummary: string;
  handoffId: string;
  idempotencyKey: string;
}) {
  return {
    handoff_id: input.handoffId,
    idempotencyKey: input.idempotencyKey,
    intent: input.intent,
    action_summary: input.actionSummary,
    candidate_unit_ids: input.reservation.unitAllocations.map((allocation) => allocation.unitId),
    requested_quantities: input.reservation.unitAllocations.map((allocation) => ({
      unit_id: allocation.unitId,
      quantity: allocation.quantity,
    })),
  };
}

async function runExecutionAttemptWithRedelegationRefresh(input: {
  lendingBaseUrl: string;
  lendingThreadId: string;
  portfolioManagerBaseUrl: string;
  portfolioThreadId: string;
  stage: string;
  executionIdempotencyKey?: string;
}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const executionPromise = runAgentCommand({
      baseUrl: input.lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: input.lendingThreadId,
      runId: `${input.lendingThreadId}-${input.stage}-execute-${attempt}`,
      command: {
        name: 'request_transaction_execution',
        ...(input.executionIdempotencyKey
          ? {
              input: {
                idempotencyKey: input.executionIdempotencyKey,
              },
            }
          : {}),
      },
    });

    await sleep(100);
    await runAgentCommand({
      baseUrl: input.portfolioManagerBaseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: input.portfolioThreadId,
      runId: `${input.portfolioThreadId}-${input.stage}-refresh-${attempt}`,
      command: {
        name: 'refresh_redelegation_work',
      },
    });
    const executionResult = await executionPromise;
    const lifecycle = readSnapshotLifecycle(executionResult.snapshot) as Record<string, unknown> | null;
    const transactionHash = readString(lifecycle?.['lastExecutionTxHash']);
    if (transactionHash) {
      return {
        snapshot: executionResult.snapshot,
        transactionHash,
      };
    }

    await sleep(500);
  }

  throw new Error(`${input.stage} execution did not confirm after retries.`);
}

async function waitForPortfolioState(input: {
  sharedEmberBaseUrl: string;
  stage: string;
  predicate: (result: PortfolioReadResult) => boolean;
}) {
  let lastResult: PortfolioReadResult | null = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = await fetchPortfolioState({
      sharedEmberBaseUrl: input.sharedEmberBaseUrl,
    });
    lastResult = result;
    if (input.predicate(result)) {
      return result;
    }

    await sleep(750);
  }

  throw new Error(
    `${input.stage} portfolio state did not satisfy the expected condition. Last result: ${JSON.stringify(lastResult, null, 2)}`,
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

  try {
    if (STACK_MODE === 'selfboot') {
      const sharedEmberBaseUrl = sharedEmber!.baseUrl;
      portfolioManagerServer = await startWorkspaceAgentServer({
        cwd: path.join(webAgUiRoot, 'apps/agent-portfolio-manager'),
        env: {
          ...parseDotEnvFile(path.join(webAgUiRoot, 'apps/agent-portfolio-manager/.env')),
          ...process.env,
          SHARED_EMBER_BASE_URL: sharedEmberBaseUrl,
        },
        label: 'agent-portfolio-manager',
        basePath: '/ag-ui',
      });

      lendingServer = await startWorkspaceAgentServer({
        cwd: path.join(webAgUiRoot, 'apps/agent-ember-lending'),
        env: {
          ...parseDotEnvFile(path.join(webAgUiRoot, 'apps/agent-ember-lending/.env')),
          ...process.env,
          SHARED_EMBER_BASE_URL: sharedEmberBaseUrl,
        },
        label: 'agent-ember-lending',
        basePath: '/ag-ui',
      });
    }

    const sharedEmberBaseUrl = sharedEmber?.baseUrl ?? EXTERNAL_SHARED_EMBER_BASE_URL;
    const portfolioManagerBaseUrl =
      portfolioManagerServer?.baseUrl ?? EXTERNAL_PORTFOLIO_MANAGER_BASE_URL;
    const lendingBaseUrl = lendingServer?.baseUrl ?? EXTERNAL_LENDING_BASE_URL;

    const identities = readIdentities();
    const rootAccount = privateKeyToAccount(identities.root_owner.private_key);
    const executorAccount = privateKeyToAccount(identities.subagent.private_key);
    const externalAccount = executorAccount;

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(ARBITRUM_RPC_URL),
    });
    const rootWalletClient = createWalletClient({
      account: rootAccount,
      chain: arbitrum,
      transport: http(ARBITRUM_RPC_URL),
    });
    const externalWalletClient = createWalletClient({
      account: externalAccount,
      chain: arbitrum,
      transport: http(ARBITRUM_RPC_URL),
    });
    const browserSigningWalletClient = createBrowserStyleSigningWalletClient(rootAccount);

    await ensureStateless7702Ready({
      publicClient,
      ownerWalletClient: rootWalletClient,
      executorAccount,
      rootAddress: rootAccount.address,
    });

    const rootSmartAccount = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Stateless7702,
      address: rootAccount.address,
      signer: {
        walletClient: rootWalletClient,
      },
    });

    await ensureWethBalance({
      publicClient,
      fundingWalletClient: externalWalletClient,
      fundingAccount: externalAccount,
      targetWalletClient: rootWalletClient,
      targetAccount: rootAccount,
      targetAddress: rootSmartAccount.address,
      minimumBalance: MIN_ROOT_WETH,
    });
    const nonce = Date.now().toString(36);
    const portfolioThreadId = `pm-idle-reconciliation-${nonce}`;
    const lendingThreadId = `lend-idle-reconciliation-${nonce}`;

    console.log(
      JSON.stringify(
        {
          phase: 'bootstrap',
          stackMode: STACK_MODE,
          sharedEmberBaseUrl,
          portfolioManagerBaseUrl,
          lendingBaseUrl,
          rootSmartWallet: rootSmartAccount.address,
          externalWallet: externalAccount.address,
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
        `Portfolio-manager setup did not emit a delegation signing interrupt: ${JSON.stringify(setupResult.snapshot, null, 2)}`,
      );
    }

    const signedRootDelegations: Array<UnsignedDelegation & { signature: `0x${string}` }> = [];
    for (const delegation of signingInterrupt.delegationsToSign) {
      const signature = await signDelegationWithFallback({
        walletClient: browserSigningWalletClient,
        delegation,
        delegationManager: signingInterrupt.delegationManager,
        chainId: signingInterrupt.chainId,
        account: signingInterrupt.delegatorAddress,
      });
      signedRootDelegations.push({ ...delegation, signature });
    }

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

    const expectedMandateRef = readExpectedMandateRef(signingResult.snapshot);
    if (!expectedMandateRef) {
      throw new Error(
        `Portfolio-manager activation did not expose a mandate ref: ${JSON.stringify(signingResult.snapshot, null, 2)}`,
      );
    }

    await waitForLendingHydration({
      baseUrl: lendingBaseUrl,
      threadId: lendingThreadId,
      rootUserWallet: rootSmartAccount.address,
      expectedMandateRef,
    });

    const preSupplyInventory = await runAgentMessage({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-inventory-before-supply`,
      prompt: 'Report your current mandate, owned units, reservations, and wallet contents from the live runtime context.',
    });
    const preSupplyAssistantText = requireAssistantText(
      preSupplyInventory.assistantText,
      'pre-supply inventory',
    );
    if (!/mandate/i.test(preSupplyAssistantText) || !/wallet/i.test(preSupplyAssistantText)) {
      throw new Error(
        `Pre-supply inventory did not summarize mandate and wallet context: ${preSupplyAssistantText}`,
      );
    }
    console.log(
      JSON.stringify(
        {
          phase: 'pre-supply-inventory',
          assistantText: truncateForLog(preSupplyAssistantText),
        },
        null,
        2,
      ),
    );

    const initialExecutionPromise = runAgentMessage({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-initial-supply-via-agent`,
      prompt:
        'Create and execute whatever transaction is required to meet your current lending mandate right now.',
    });
    await sleep(100);
    await runAgentCommand({
      baseUrl: portfolioManagerBaseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: portfolioThreadId,
      runId: `${portfolioThreadId}-initial-agent-refresh`,
      command: {
        name: 'refresh_redelegation_work',
      },
    });
    const initialExecution = await initialExecutionPromise;
    const initialExecutionTxHash = readLifecycleExecutionTxHash(initialExecution.snapshot);
    if (!initialExecutionTxHash) {
      throw new Error(
        `Supply-through-agent did not confirm an execution tx hash: ${JSON.stringify(initialExecution.snapshot, null, 2)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          phase: 'initial-supply-completed',
          transactionHash: initialExecutionTxHash,
          assistantText: truncateForLog(
            requireAssistantText(initialExecution.assistantText, 'initial supply execution'),
          ),
        },
        null,
        2,
      ),
    );

    const postSupply = await waitForPortfolioState({
      sharedEmberBaseUrl,
      stage: 'post-supply',
      predicate: (result) =>
        readActiveReservationByControlPath(result.portfolioState, 'lending.withdraw') !== null &&
        readActiveReservationByControlPath(result.portfolioState, 'lending.borrow') !== null,
    });
    const withdrawReservation = readActiveReservationByControlPath(
      postSupply.portfolioState,
      'lending.withdraw',
    );
    if (!withdrawReservation) {
      throw new Error(
        `Expected active lending.withdraw reservation after supply: ${JSON.stringify(postSupply.portfolioState, null, 2)}`,
      );
    }

    const suppliedUnitId = readOwnedUnitIdByControlPath(postSupply.portfolioState, 'lending.supply');
    if (!suppliedUnitId) {
      throw new Error(
        `Expected a deployed lending.supply owned unit after supply: ${JSON.stringify(postSupply.portfolioState, null, 2)}`,
      );
    }

    const postSupplyInventory = await runAgentMessage({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-inventory-after-supply`,
      prompt: 'Report your current mandate, owned units, reservations, and wallet contents from the live runtime context.',
    });
    const postSupplyAssistantText = requireAssistantText(
      postSupplyInventory.assistantText,
      'post-supply inventory',
    );
    if (!postSupplyAssistantText.includes(suppliedUnitId)) {
      throw new Error(
        `Post-supply inventory did not mention the live successor unit ${suppliedUnitId}: ${postSupplyAssistantText}`,
      );
    }
    console.log(
      JSON.stringify(
        {
          phase: 'post-supply-inventory',
          suppliedUnitId,
          assistantText: truncateForLog(postSupplyAssistantText),
        },
        null,
        2,
      ),
    );

    const borrowPlan = await runAgentMessage({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-borrow-plan-via-agent`,
      prompt: 'Create a borrow transaction plan for the maximum WETH currently allowed under the active mandate.',
    });
    const borrowAssistantText = requireAssistantText(
      borrowPlan.assistantText,
      'borrow planning',
    );
    if (/Portfolio Manager-admitted units|not admitted|can only plan with/i.test(borrowAssistantText)) {
      throw new Error(`Borrow plan hit the admitted-unit blocker: ${borrowAssistantText}`);
    }
    const borrowArtifact = readSnapshotArtifact(borrowPlan.snapshot);
    if (!isRecord(borrowArtifact) || readString(borrowArtifact['type']) !== 'shared-ember-candidate-plan') {
      throw new Error(
        `Borrow plan did not surface a candidate plan artifact: ${JSON.stringify(borrowPlan.snapshot, null, 2)}`,
      );
    }
    const borrowCandidateUnitIds = readLifecycleCandidateUnitIds(borrowPlan.snapshot);
    if (!borrowCandidateUnitIds.includes(suppliedUnitId)) {
      throw new Error(
        `Borrow plan did not normalize onto the live supplied unit ${suppliedUnitId}: ${JSON.stringify(borrowCandidateUnitIds)}`,
      );
    }
    console.log(
      JSON.stringify(
        {
          phase: 'borrow-planned',
          candidateUnitIds: borrowCandidateUnitIds,
          assistantText: truncateForLog(borrowAssistantText),
        },
        null,
        2,
      ),
    );

    await runAgentCommand({
      baseUrl: lendingBaseUrl,
      agentId: EMBER_LENDING_AGENT_ID,
      threadId: lendingThreadId,
      runId: `${lendingThreadId}-full-withdraw-plan`,
      command: {
        name: 'create_transaction_plan',
        input: buildFollowUpPlanningInput({
          reservation: withdrawReservation,
          intent: 'unwind',
          handoffId: `handoff-${lendingThreadId}-full-withdraw`,
          idempotencyKey: `idem-create-transaction-plan-${lendingThreadId}-full-withdraw`,
          actionSummary:
            'withdraw all supplied WETH back to the rooted wallet after the lending lane fully unwinds',
        }),
      },
    });

    const unwindExecution = await runExecutionAttemptWithRedelegationRefresh({
      lendingBaseUrl,
      lendingThreadId,
      portfolioManagerBaseUrl,
      portfolioThreadId,
      stage: 'full-withdraw',
      executionIdempotencyKey: `idem-execute-transaction-plan-${lendingThreadId}-full-withdraw`,
    });

    console.log(
      JSON.stringify(
        {
          phase: 'full-withdraw-completed',
          transactionHash: unwindExecution.transactionHash,
        },
        null,
        2,
      ),
    );

    const postWithdraw = await waitForPortfolioState({
      sharedEmberBaseUrl,
      stage: 'post-withdraw',
      predicate: (result) => readActiveReservationByControlPath(result.portfolioState, 'lending.supply') !== null,
    });
    const postWithdrawSupplyQuantity = readReservationQuantity(
      postWithdraw.portfolioState,
      'lending.supply',
    );
    if (!postWithdrawSupplyQuantity || postWithdrawSupplyQuantity <= 0n) {
      throw new Error(
        `Expected active lending.supply coverage after full withdraw: ${JSON.stringify(postWithdraw.portfolioState, null, 2)}`,
      );
    }

    const onboardingState = await fetchOnboardingState({
      sharedEmberBaseUrl,
      walletAddress: rootSmartAccount.address,
    });
    if (readString(onboardingState.onboardingState?.['phase']) !== 'active') {
      throw new Error(
        `Expected onboarding phase active after full withdraw: ${JSON.stringify(onboardingState.onboardingState, null, 2)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          phase: 'post-withdraw-reconciled',
          revision: postWithdraw.revision,
          supplyQuantity: postWithdrawSupplyQuantity.toString(),
          onboardingRevision: onboardingState.revision,
        },
        null,
        2,
      ),
    );

    const egressHash = await transferWeth({
      publicClient,
      walletClient: rootWalletClient,
      account: rootAccount,
      to: externalAccount.address,
      amount: EGRESS_AMOUNT,
    });

    const postEgress = await waitForPortfolioState({
      sharedEmberBaseUrl,
      stage: 'post-egress',
      predicate: (result) => {
        const quantity = readReservationQuantity(result.portfolioState, 'lending.supply');
        return quantity !== null && quantity < postWithdrawSupplyQuantity;
      },
    });
    const postEgressSupplyQuantity = readReservationQuantity(
      postEgress.portfolioState,
      'lending.supply',
    );
    if (!postEgressSupplyQuantity) {
      throw new Error('Expected active supply coverage after egress.');
    }

    const stableEgressRead = await fetchPortfolioState({
      sharedEmberBaseUrl,
    });
    const stableEgressQuantity = readReservationQuantity(
      stableEgressRead.portfolioState,
      'lending.supply',
    );
    const postEgressFingerprint = readWethCoverageFingerprint(postEgress.portfolioState);
    const stableEgressFingerprint = readWethCoverageFingerprint(stableEgressRead.portfolioState);
    if (
      stableEgressQuantity !== postEgressSupplyQuantity ||
      stableEgressFingerprint !== postEgressFingerprint
    ) {
      throw new Error(
        `Egress follow-up changed WETH coverage. First=${postEgress.revision}/${postEgressSupplyQuantity.toString()} second=${String(stableEgressRead.revision)}/${stableEgressQuantity?.toString() ?? 'null'}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          phase: 'post-egress',
          txHash: egressHash,
          revision: postEgress.revision,
          supplyQuantity: postEgressSupplyQuantity.toString(),
          supplyQuantityFormatted: formatUnits(postEgressSupplyQuantity, 18),
        },
        null,
        2,
      ),
    );

    const ingressHash = await transferWeth({
      publicClient,
      walletClient: externalWalletClient,
      account: externalAccount,
      to: rootSmartAccount.address,
      amount: INGRESS_AMOUNT,
    });

    const postIngress = await waitForPortfolioState({
      sharedEmberBaseUrl,
      stage: 'post-ingress',
      predicate: (result) => {
        const quantity = readReservationQuantity(result.portfolioState, 'lending.supply');
        return quantity !== null && quantity > postEgressSupplyQuantity;
      },
    });
    const postIngressSupplyQuantity = readReservationQuantity(
      postIngress.portfolioState,
      'lending.supply',
    );
    if (!postIngressSupplyQuantity) {
      throw new Error('Expected active supply coverage after ingress.');
    }

    const stableIngressRead = await fetchPortfolioState({
      sharedEmberBaseUrl,
    });
    const stableIngressQuantity = readReservationQuantity(
      stableIngressRead.portfolioState,
      'lending.supply',
    );
    const postIngressFingerprint = readWethCoverageFingerprint(postIngress.portfolioState);
    const stableIngressFingerprint = readWethCoverageFingerprint(stableIngressRead.portfolioState);
    if (
      stableIngressQuantity !== postIngressSupplyQuantity ||
      stableIngressFingerprint !== postIngressFingerprint
    ) {
      throw new Error(
        `Ingress follow-up changed WETH coverage. First=${postIngress.revision}/${postIngressSupplyQuantity.toString()} second=${String(stableIngressRead.revision)}/${stableIngressQuantity?.toString() ?? 'null'}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          phase: 'post-ingress',
          txHash: ingressHash,
          revision: postIngress.revision,
          supplyQuantity: postIngressSupplyQuantity.toString(),
          supplyQuantityFormatted: formatUnits(postIngressSupplyQuantity, 18),
        },
        null,
        2,
      ),
    );

    console.log(
      JSON.stringify(
        {
          phase: 'done',
          initialExecution: initialExecutionTxHash,
          unwindExecution: unwindExecution.transactionHash,
          finalSupplyQuantity: postIngressSupplyQuantity.toString(),
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

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke:managed-idle-reconciliation] FAILED:', message);
  process.exitCode = 1;
});
