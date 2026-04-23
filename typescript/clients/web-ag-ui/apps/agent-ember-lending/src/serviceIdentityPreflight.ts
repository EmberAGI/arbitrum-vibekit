import {
  EMBER_LENDING_SHARED_EMBER_AGENT_ID,
  type EmberLendingSharedEmberProtocolHost,
} from './sharedEmberAdapter.js';

type EnsureEmberLendingServiceIdentityInput = {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  readSignerWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
};

type AgentServiceIdentity = {
  identity_ref: string;
  agent_id: string;
  role: 'subagent';
  wallet_address: `0x${string}`;
  wallet_source: string;
  capability_metadata: Record<string, unknown>;
  registration_version: number;
  registered_at: string;
};

const EMBER_LENDING_SERVICE_ROLE = 'subagent';
const EMBER_LENDING_WALLET_SOURCE = 'ember_local_write';
const EMBER_LENDING_CAPABILITY_METADATA = {
  execution: true,
  onboarding: true,
};
const UNCONFIRMED_SUBAGENT_IDENTITY_ERROR =
  'Lending startup identity preflight failed because Shared Ember did not confirm the expected subagent identity.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized as `0x${string}`) : null;
}

function readInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readAgentServiceIdentity(value: unknown): AgentServiceIdentity | null {
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

  if (agentId !== EMBER_LENDING_SHARED_EMBER_AGENT_ID) {
    return null;
  }

  if (readString(value['role']) !== EMBER_LENDING_SERVICE_ROLE) {
    return null;
  }

  return {
    identity_ref: identityRef,
    agent_id: agentId,
    role: EMBER_LENDING_SERVICE_ROLE,
    wallet_address: walletAddress,
    wallet_source: walletSource,
    capability_metadata: capabilityMetadata,
    registration_version: registrationVersion,
    registered_at: registeredAt,
  };
}

async function readCurrentIdentity(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
}): Promise<{
  revision: number;
  identity: AgentServiceIdentity | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    method: 'orchestrator.readAgentServiceIdentity.v1',
    params: {
      agent_id: EMBER_LENDING_SHARED_EMBER_AGENT_ID,
      role: EMBER_LENDING_SERVICE_ROLE,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']) ?? 0,
    identity: readAgentServiceIdentity(result?.['agent_service_identity'] ?? null),
  };
}

async function writeIdentity(input: {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  expectedRevision: number;
  identity: AgentServiceIdentity;
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
    identity: readAgentServiceIdentity(result?.['agent_service_identity'] ?? null),
  };
}

function requireConfirmedIdentity(input: {
  expectedIdentity: Pick<AgentServiceIdentity, 'agent_id' | 'role' | 'wallet_address'>;
  identity: AgentServiceIdentity | null;
}): AgentServiceIdentity {
  if (
    input.identity?.agent_id !== input.expectedIdentity.agent_id ||
    input.identity?.role !== input.expectedIdentity.role ||
    input.identity?.wallet_address !== input.expectedIdentity.wallet_address
  ) {
    throw new Error(UNCONFIRMED_SUBAGENT_IDENTITY_ERROR);
  }

  return input.identity;
}

export async function ensureEmberLendingServiceIdentity(
  input: EnsureEmberLendingServiceIdentityInput,
): Promise<{
  revision: number | null;
  wroteIdentity: boolean;
  identity: AgentServiceIdentity;
}> {
  const walletAddress = await input.readSignerWalletAddress();
  const current = await readCurrentIdentity({
    protocolHost: input.protocolHost,
  });

  if (current.identity?.wallet_address === walletAddress) {
    return {
      revision: current.revision,
      wroteIdentity: false,
      identity: current.identity,
    };
  }

  const registrationVersion = (current.identity?.registration_version ?? 0) + 1;
  const identity: AgentServiceIdentity = {
    identity_ref: `agent-service-identity-${EMBER_LENDING_SHARED_EMBER_AGENT_ID}-${EMBER_LENDING_SERVICE_ROLE}-${registrationVersion}`,
    agent_id: EMBER_LENDING_SHARED_EMBER_AGENT_ID,
    role: EMBER_LENDING_SERVICE_ROLE,
    wallet_address: walletAddress,
    wallet_source: EMBER_LENDING_WALLET_SOURCE,
    capability_metadata: EMBER_LENDING_CAPABILITY_METADATA,
    registration_version: registrationVersion,
    registered_at: (input.now ?? (() => new Date()))().toISOString(),
  };
  const written = await writeIdentity({
    protocolHost: input.protocolHost,
    expectedRevision: current.revision,
    identity,
  });
  const confirmedIdentity = requireConfirmedIdentity({
    expectedIdentity: identity,
    identity: written.identity,
  });

  return {
    revision: written.revision,
    wroteIdentity: true,
    identity: confirmedIdentity,
  };
}
