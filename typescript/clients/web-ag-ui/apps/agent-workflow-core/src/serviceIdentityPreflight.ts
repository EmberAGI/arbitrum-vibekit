type AgentServiceIdentityProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
};

export type AgentServiceIdentityRole = 'orchestrator' | 'subagent';

export type AgentServiceIdentity<Role extends AgentServiceIdentityRole = AgentServiceIdentityRole> = {
  identity_ref: string;
  agent_id: string;
  role: Role;
  wallet_address: `0x${string}`;
  wallet_source: string;
  capability_metadata: Record<string, unknown>;
  registration_version: number;
  registered_at: string;
};

type EnsureAgentServiceIdentityInput<Role extends AgentServiceIdentityRole> = {
  protocolHost: AgentServiceIdentityProtocolHost;
  agentId: string;
  role: Role;
  walletSource: string;
  capabilityMetadata: Record<string, unknown>;
  readWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
  unconfirmedIdentityErrorMessage: string;
};

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

function readAgentServiceIdentity<Role extends AgentServiceIdentityRole>(input: {
  value: unknown;
  agentId: string;
  role: Role;
}): AgentServiceIdentity<Role> | null {
  if (!isRecord(input.value)) {
    return null;
  }

  const identityRef = readString(input.value['identity_ref']);
  const agentId = readString(input.value['agent_id']);
  const walletAddress = readHexAddress(input.value['wallet_address']);
  const walletSource = readString(input.value['wallet_source']);
  const registrationVersion = readInt(input.value['registration_version']);
  const registeredAt = readString(input.value['registered_at']);
  const capabilityMetadata = isRecord(input.value['capability_metadata'])
    ? input.value['capability_metadata']
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

  if (agentId !== input.agentId) {
    return null;
  }

  if (readString(input.value['role']) !== input.role) {
    return null;
  }

  return {
    identity_ref: identityRef,
    agent_id: input.agentId,
    role: input.role,
    wallet_address: walletAddress,
    wallet_source: walletSource,
    capability_metadata: capabilityMetadata,
    registration_version: registrationVersion,
    registered_at: registeredAt,
  };
}

async function readCurrentIdentity<Role extends AgentServiceIdentityRole>(input: {
  protocolHost: AgentServiceIdentityProtocolHost;
  agentId: string;
  role: Role;
}): Promise<{
  revision: number;
  identity: AgentServiceIdentity<Role> | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    method: 'orchestrator.readAgentServiceIdentity.v1',
    params: {
      agent_id: input.agentId,
      role: input.role,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']) ?? 0,
    identity: readAgentServiceIdentity({
      value: result?.['agent_service_identity'] ?? null,
      agentId: input.agentId,
      role: input.role,
    }),
  };
}

async function writeIdentity<Role extends AgentServiceIdentityRole>(input: {
  protocolHost: AgentServiceIdentityProtocolHost;
  expectedRevision: number;
  identity: AgentServiceIdentity<Role>;
}): Promise<{
  revision: number | null;
  identity: AgentServiceIdentity<Role> | null;
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
    identity: readAgentServiceIdentity({
      value: result?.['agent_service_identity'] ?? null,
      agentId: input.identity.agent_id,
      role: input.identity.role,
    }),
  };
}

function requireConfirmedIdentity<Role extends AgentServiceIdentityRole>(input: {
  expectedIdentity: Pick<AgentServiceIdentity<Role>, 'agent_id' | 'role' | 'wallet_address'>;
  identity: AgentServiceIdentity<Role> | null;
  unconfirmedIdentityErrorMessage: string;
}): AgentServiceIdentity<Role> {
  if (
    input.identity?.agent_id !== input.expectedIdentity.agent_id ||
    input.identity?.role !== input.expectedIdentity.role ||
    input.identity?.wallet_address !== input.expectedIdentity.wallet_address
  ) {
    throw new Error(input.unconfirmedIdentityErrorMessage);
  }

  return input.identity;
}

export async function ensureAgentServiceIdentity<Role extends AgentServiceIdentityRole>(
  input: EnsureAgentServiceIdentityInput<Role>,
): Promise<{
  revision: number | null;
  wroteIdentity: boolean;
  identity: AgentServiceIdentity<Role>;
}> {
  const walletAddress = await input.readWalletAddress();
  const current = await readCurrentIdentity({
    protocolHost: input.protocolHost,
    agentId: input.agentId,
    role: input.role,
  });

  if (current.identity?.wallet_address === walletAddress) {
    return {
      revision: current.revision,
      wroteIdentity: false,
      identity: current.identity,
    };
  }

  const registrationVersion = (current.identity?.registration_version ?? 0) + 1;
  const identity: AgentServiceIdentity<Role> = {
    identity_ref: `agent-service-identity-${input.agentId}-${input.role}-${registrationVersion}`,
    agent_id: input.agentId,
    role: input.role,
    wallet_address: walletAddress,
    wallet_source: input.walletSource,
    capability_metadata: input.capabilityMetadata,
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
    unconfirmedIdentityErrorMessage: input.unconfirmedIdentityErrorMessage,
  });

  return {
    revision: written.revision,
    wroteIdentity: true,
    identity: confirmedIdentity,
  };
}
