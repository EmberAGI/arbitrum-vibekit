import { isAddress, isAddressEqual } from 'viem';

import {
  PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID,
  type PortfolioManagerSharedEmberProtocolHost,
} from './sharedEmberAdapter.js';

type EnsurePortfolioManagerServiceIdentityInput = {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  readControllerWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
};

type EnsureHiddenOcaExecutorServiceIdentityInput = {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  readExecutorWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
};

type EnsurePortfolioManagerServiceIdentitiesInput = EnsurePortfolioManagerServiceIdentityInput & {
  readExecutorWalletAddress?: () => Promise<`0x${string}`>;
};

type AgentServiceIdentityRole = 'orchestrator' | 'subagent';

type AgentServiceIdentity = {
  identity_ref: string;
  agent_id: string;
  role: AgentServiceIdentityRole;
  wallet_address: `0x${string}`;
  wallet_source: string;
  capability_metadata: Record<string, unknown>;
  registration_version: number;
  registered_at: string;
};

type EnsureServiceIdentityResult = {
  revision: number | null;
  wroteIdentity: boolean;
  identity: AgentServiceIdentity;
};

type DeferredHiddenWorkerIdentity = {
  status: 'deferred';
  reason: string;
};

type AgentServiceIdentitySpec = {
  agentId: string;
  role: AgentServiceIdentityRole;
  walletSource: string;
  capabilityMetadata: Record<string, unknown>;
  unconfirmedIdentityError: string;
};

export const HIDDEN_OCA_EXECUTOR_AGENT_ID = 'agent-oca-executor';
export const HIDDEN_OCA_EXECUTOR_OWNER_AGENT_ID = 'agent-portfolio-manager';
export const HIDDEN_OCA_EXECUTOR_CONTROL_PATH = 'spot.swap';

const PORTFOLIO_MANAGER_SERVICE_ROLE = 'orchestrator';
const PORTFOLIO_MANAGER_WALLET_SOURCE = 'ember_local_write';
const PORTFOLIO_MANAGER_CAPABILITY_METADATA = {
  onboarding: true,
  root_registration: true,
};
const HIDDEN_OCA_EXECUTOR_SERVICE_ROLE = 'subagent';
const HIDDEN_OCA_EXECUTOR_WALLET_SOURCE = 'ember_local_write';
const HIDDEN_OCA_EXECUTOR_CAPABILITY_METADATA = {
  visibility: 'internal',
  owner_agent_id: HIDDEN_OCA_EXECUTOR_OWNER_AGENT_ID,
  worker_kind: 'execution',
  execution_surface: 'onchain_actions',
  control_paths: [HIDDEN_OCA_EXECUTOR_CONTROL_PATH],
};
const UNCONFIRMED_ORCHESTRATOR_IDENTITY_ERROR =
  'Portfolio-manager startup identity preflight failed because Shared Ember did not confirm the expected orchestrator identity.';
const UNCONFIRMED_HIDDEN_OCA_EXECUTOR_IDENTITY_ERROR =
  'Portfolio-manager startup identity preflight failed because Shared Ember did not confirm the expected hidden Onchain Actions executor identity.';
const PORTFOLIO_MANAGER_IDENTITY_SPEC: AgentServiceIdentitySpec = {
  agentId: PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID,
  role: PORTFOLIO_MANAGER_SERVICE_ROLE,
  walletSource: PORTFOLIO_MANAGER_WALLET_SOURCE,
  capabilityMetadata: PORTFOLIO_MANAGER_CAPABILITY_METADATA,
  unconfirmedIdentityError: UNCONFIRMED_ORCHESTRATOR_IDENTITY_ERROR,
};
const HIDDEN_OCA_EXECUTOR_IDENTITY_SPEC: AgentServiceIdentitySpec = {
  agentId: HIDDEN_OCA_EXECUTOR_AGENT_ID,
  role: HIDDEN_OCA_EXECUTOR_SERVICE_ROLE,
  walletSource: HIDDEN_OCA_EXECUTOR_WALLET_SOURCE,
  capabilityMetadata: HIDDEN_OCA_EXECUTOR_CAPABILITY_METADATA,
  unconfirmedIdentityError: UNCONFIRMED_HIDDEN_OCA_EXECUTOR_IDENTITY_ERROR,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized && isAddress(normalized, { strict: false })
    ? (normalized.toLowerCase() as `0x${string}`)
    : null;
}

function readInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function metadataValueMatches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((entry, index) => metadataValueMatches(entry, actual[index]))
    );
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      return false;
    }

    return Object.entries(expected).every(([key, value]) =>
      metadataValueMatches(value, actual[key]),
    );
  }

  return actual === expected;
}

function capabilityMetadataMatches(input: {
  actual: Record<string, unknown>;
  expected: Record<string, unknown>;
}): boolean {
  return Object.entries(input.expected).every(([key, value]) =>
    metadataValueMatches(value, input.actual[key]),
  );
}

function serviceIdentityMatchesSpec(input: {
  identity: AgentServiceIdentity;
  walletAddress: `0x${string}`;
  spec: AgentServiceIdentitySpec;
}): boolean {
  return (
    isAddressEqual(input.identity.wallet_address, input.walletAddress) &&
    input.identity.wallet_source === input.spec.walletSource &&
    capabilityMetadataMatches({
      actual: input.identity.capability_metadata,
      expected: input.spec.capabilityMetadata,
    })
  );
}

function readAgentServiceIdentity(
  value: unknown,
  spec: Pick<AgentServiceIdentitySpec, 'agentId' | 'role'>,
): AgentServiceIdentity | null {
  if (!isRecord(value)) {
    return null;
  }

  const identityRef = readString(value['identity_ref']);
  const agentId = readString(value['agent_id']);
  const walletAddress = readHexAddress(value['wallet_address']);
  const walletSource = readString(value['wallet_source']);
  const registrationVersion = readInt(value['registration_version']);
  const registeredAt = readString(value['registered_at']);
  const capabilityMetadata = isRecord(value['capability_metadata'])
    ? value['capability_metadata']
    : null;

  if (
    identityRef === null ||
    agentId === null ||
    walletAddress === null ||
    walletSource === null ||
    registrationVersion === null ||
    registeredAt === null ||
    capabilityMetadata === null
  ) {
    return null;
  }

  if (agentId !== spec.agentId) {
    return null;
  }

  if (readString(value['role']) !== spec.role) {
    return null;
  }

  return {
    identity_ref: identityRef,
    agent_id: agentId,
    role: spec.role,
    wallet_address: walletAddress,
    wallet_source: walletSource,
    capability_metadata: capabilityMetadata,
    registration_version: registrationVersion,
    registered_at: registeredAt,
  };
}

async function readCurrentIdentity(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  spec: AgentServiceIdentitySpec;
}): Promise<{
  revision: number;
  identity: AgentServiceIdentity | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    method: 'orchestrator.readAgentServiceIdentity.v1',
    params: {
      agent_id: input.spec.agentId,
      role: input.spec.role,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']) ?? 0,
    identity: readAgentServiceIdentity(result?.['agent_service_identity'] ?? null, input.spec),
  };
}

async function writeIdentity(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  expectedRevision: number;
  identity: AgentServiceIdentity;
  spec: AgentServiceIdentitySpec;
}): Promise<{
  revision: number | null;
  identity: AgentServiceIdentity | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-write',
    method: 'orchestrator.writeAgentServiceIdentity.v1',
    params: {
      idempotency_key: `idem-agent-service-identity-${input.identity.identity_ref}`,
      expected_revision: input.expectedRevision,
      agent_service_identity: input.identity,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']),
    identity: readAgentServiceIdentity(result?.['agent_service_identity'] ?? null, input.spec),
  };
}

function requireConfirmedIdentity(input: {
  expectedIdentity: AgentServiceIdentity;
  identity: AgentServiceIdentity | null;
  spec: AgentServiceIdentitySpec;
  unconfirmedIdentityError: string;
}): AgentServiceIdentity {
  if (
    input.identity?.agent_id !== input.expectedIdentity.agent_id ||
    input.identity?.role !== input.expectedIdentity.role ||
    !serviceIdentityMatchesSpec({
      identity: input.identity,
      walletAddress: input.expectedIdentity.wallet_address,
      spec: input.spec,
    })
  ) {
    throw new Error(input.unconfirmedIdentityError);
  }

  return input.identity;
}

async function ensureAgentServiceIdentity(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  readWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
  spec: AgentServiceIdentitySpec;
}): Promise<EnsureServiceIdentityResult> {
  const walletAddress = await input.readWalletAddress();
  const current = await readCurrentIdentity({
    protocolHost: input.protocolHost,
    spec: input.spec,
  });

  if (
    current.identity &&
    serviceIdentityMatchesSpec({
      identity: current.identity,
      walletAddress,
      spec: input.spec,
    })
  ) {
    return {
      revision: current.revision,
      wroteIdentity: false,
      identity: current.identity,
    };
  }

  const registrationVersion = (current.identity?.registration_version ?? 0) + 1;
  const identity: AgentServiceIdentity = {
    identity_ref: `agent-service-identity-${input.spec.agentId}-${input.spec.role}-${registrationVersion}`,
    agent_id: input.spec.agentId,
    role: input.spec.role,
    wallet_address: walletAddress,
    wallet_source: input.spec.walletSource,
    capability_metadata: input.spec.capabilityMetadata,
    registration_version: registrationVersion,
    registered_at: (input.now ?? (() => new Date()))().toISOString(),
  };
  const written = await writeIdentity({
    protocolHost: input.protocolHost,
    expectedRevision: current.revision,
    identity,
    spec: input.spec,
  });
  const confirmedIdentity = requireConfirmedIdentity({
    expectedIdentity: identity,
    identity: written.identity,
    spec: input.spec,
    unconfirmedIdentityError: input.spec.unconfirmedIdentityError,
  });

  return {
    revision: written.revision,
    wroteIdentity: true,
    identity: confirmedIdentity,
  };
}

export async function ensurePortfolioManagerServiceIdentity(
  input: EnsurePortfolioManagerServiceIdentityInput,
): Promise<EnsureServiceIdentityResult> {
  return ensureAgentServiceIdentity({
    protocolHost: input.protocolHost,
    readWalletAddress: input.readControllerWalletAddress,
    now: input.now,
    spec: PORTFOLIO_MANAGER_IDENTITY_SPEC,
  });
}

export async function ensureHiddenOcaExecutorServiceIdentity(
  input: EnsureHiddenOcaExecutorServiceIdentityInput,
): Promise<EnsureServiceIdentityResult> {
  return ensureAgentServiceIdentity({
    protocolHost: input.protocolHost,
    readWalletAddress: input.readExecutorWalletAddress,
    now: input.now,
    spec: HIDDEN_OCA_EXECUTOR_IDENTITY_SPEC,
  });
}

export async function ensurePortfolioManagerServiceIdentities(
  input: EnsurePortfolioManagerServiceIdentitiesInput,
): Promise<{
  orchestrator: EnsureServiceIdentityResult;
  hiddenOcaExecutor: EnsureServiceIdentityResult | DeferredHiddenWorkerIdentity | null;
}> {
  const orchestrator = await ensurePortfolioManagerServiceIdentity(input);
  if (!input.readExecutorWalletAddress) {
    return {
      orchestrator,
      hiddenOcaExecutor: null,
    };
  }

  try {
    return {
      orchestrator,
      hiddenOcaExecutor: await ensureHiddenOcaExecutorServiceIdentity({
        protocolHost: input.protocolHost,
        readExecutorWalletAddress: input.readExecutorWalletAddress,
        now: input.now,
      }),
    };
  } catch (error) {
    return {
      orchestrator,
      hiddenOcaExecutor: {
        status: 'deferred',
        reason: error instanceof Error ? error.message : 'Unknown hidden worker identity error.',
      },
    };
  }
}
