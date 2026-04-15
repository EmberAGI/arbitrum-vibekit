import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { encodeFunctionData, parseAbiItem, serializeTransaction, type AbiFunction } from 'viem';

import type { EmberLendingAnchoredPayloadResolver } from '../src/sharedEmberAdapter.js';

export type StartedSharedEmberTarget = {
  baseUrl: string;
  close: () => Promise<void>;
  anchoredPayloadResolver?: EmberLendingAnchoredPayloadResolver;
};

export const TEST_EMBER_LENDING_AGENT_ID = 'ember-lending';
export const TEST_EMBER_LENDING_AGENT_WALLET =
  '0x00000000000000000000000000000000000000b1' as const;
export const TEST_EMBER_LENDING_USER_WALLET =
  '0x00000000000000000000000000000000000000a1' as const;
export const TEST_EMBER_LENDING_ORCHESTRATOR_WALLET =
  '0x00000000000000000000000000000000000000a2' as const;

type SharedEmberExecutionSeed = ReturnType<typeof createBaseSharedEmberExecutionSeed>;

type SharedEmberExecutionSeedOptions = {
  competingReservation?: boolean;
  omitAgentServiceIdentity?: boolean;
};

type SharedEmberIntegrationBootstrap = {
  initialState?: SharedEmberExecutionSeed;
  subagentRuntimes?: Record<string, ReturnType<typeof createSubagentRuntime>>;
};

type HarnessExecutionPayloadArtifact =
  | {
      action: 'raw';
      transaction_payload_ref: string;
      required_control_path: string;
      network: string;
      target: string;
      callData: string;
      value?: string;
    }
  | {
      action: 'functionCall';
      transaction_payload_ref: string;
      required_control_path: string;
      network: string;
      target: string;
      functionSignature: string;
      args: string[];
      value?: string;
    };

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveExecutionChainId(network: string): number {
  switch (network.trim().toLowerCase()) {
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      throw new Error(`Unsupported execution network "${network}".`);
  }
}

function coerceAbiArgument(type: string, value: string): unknown {
  if (type.endsWith('[]')) {
    const parsed = JSON.parse(value) as unknown[];

    return parsed.map((item) =>
      coerceAbiArgument(
        type.slice(0, -2),
        typeof item === 'string' ? item : JSON.stringify(item),
      ),
    );
  }

  if (type.startsWith('uint') || type.startsWith('int')) {
    return BigInt(value);
  }

  if (type === 'bool') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }

    throw new Error(`Invalid boolean ABI argument ${value}.`);
  }

  return value;
}

function buildExecutionCallData(payload: HarnessExecutionPayloadArtifact): `0x${string}` {
  if (payload.action === 'raw') {
    return payload.callData as `0x${string}`;
  }

  const abiItem = parseAbiItem(`function ${payload.functionSignature}`) as AbiFunction;
  const args = abiItem.inputs.map((input, index) =>
    coerceAbiArgument(input.type, payload.args[index] ?? ''),
  );

  return encodeFunctionData({
    abi: [abiItem],
    functionName: abiItem.name,
    args,
  });
}

function buildPreparedUnsignedTransactionHex(
  payload: HarnessExecutionPayloadArtifact,
): `0x${string}` | null {
  const target = readString(payload.target);
  if (!target?.startsWith('0x')) {
    return null;
  }

  return serializeTransaction({
    chainId: resolveExecutionChainId(payload.network),
    type: 'eip1559',
    nonce: 1,
    gas: 21_000n,
    maxPriorityFeePerGas: 100_000_000n,
    maxFeePerGas: 1_000_000_000n,
    to: target as `0x${string}`,
    value: payload.value ? BigInt(payload.value) : 0n,
    data: buildExecutionCallData(payload),
  });
}

function buildAnchoredTransactionRequest(
  payload: HarnessExecutionPayloadArtifact,
): {
  type: 'EVM_TX';
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  chainId: string;
} | null {
  const target = readString(payload.target);
  if (!target?.startsWith('0x')) {
    return null;
  }

  return {
    type: 'EVM_TX',
    to: target as `0x${string}`,
    value: payload.value ?? '0',
    data: buildExecutionCallData(payload),
    chainId: String(resolveExecutionChainId(payload.network)),
  };
}

function createAnchoredPayloadResolver(input: {
  bootstrap: SharedEmberIntegrationBootstrap;
  defaultAgentId: string;
}): EmberLendingAnchoredPayloadResolver {
  return {
    async anchorCandidatePlanPayload(request) {
      const runtime =
        input.bootstrap.subagentRuntimes?.[request.agentId] ??
        (request.agentId === input.defaultAgentId ? createSubagentRuntime() : undefined);
      if (!runtime) {
        return null;
      }

      const payload = await runtime.payloadStore.getExecutionPayload(
        request.payloadBuilderOutput.transaction_payload_ref,
      );
      if (!payload) {
        return null;
      }

      const transactionRequest = buildAnchoredTransactionRequest(
        payload as HarnessExecutionPayloadArtifact,
      );
      if (!transactionRequest) {
        return null;
      }

      return {
        anchoredPayloadRef: request.payloadBuilderOutput.transaction_payload_ref,
        transactionRequests: [transactionRequest],
        controlPath: request.payloadBuilderOutput.required_control_path,
        network: request.payloadBuilderOutput.network,
        transactionPlanId: request.transactionPlanId,
      };
    },

    async resolvePreparedUnsignedTransaction(request) {
      const runtime =
        input.bootstrap.subagentRuntimes?.[request.agentId] ??
        (request.agentId === input.defaultAgentId ? createSubagentRuntime() : undefined);
      if (!runtime) {
        return null;
      }

      const plannedTransactionPayloadRef =
        request.plannedTransactionPayloadRef ??
        (request.canonicalUnsignedPayloadRef.startsWith('unsigned-')
          ? request.canonicalUnsignedPayloadRef.slice('unsigned-'.length)
          : null);
      if (!plannedTransactionPayloadRef) {
        return null;
      }

      const payload = await runtime.payloadStore.getExecutionPayload(plannedTransactionPayloadRef);
      if (!payload) {
        return null;
      }

      return buildPreparedUnsignedTransactionHex(payload as HarnessExecutionPayloadArtifact);
    },
  };
}

function createBaseSharedEmberExecutionSeed() {
  return {
    owned_units: [
      {
        unit_id: 'unit-ember-lending-001',
        root_asset: 'USDC',
        network: 'arbitrum',
        wallet_address: TEST_EMBER_LENDING_USER_WALLET,
        quantity: '10',
        owner_type: 'user_idle',
        owner_id: 'user_idle',
        status: 'reserved',
        reservation_id: 'reservation-ember-lending-001',
        delegation_id: 'del-ember-lending-001',
        control_path: 'unassigned',
        position_kind: 'unassigned',
        benchmark_asset: 'USD',
        benchmark_value: '10',
        valuation_ref: 'val-ember-lending-001',
        cost_basis: '10',
        opened_at: '2026-04-01T06:00:00Z',
        closed_at: null,
        parent_unit_ids: [],
        metadata: {},
      },
    ],
    reservations: [
      {
        reservation_id: 'reservation-ember-lending-001',
        agent_id: TEST_EMBER_LENDING_AGENT_ID,
        owner_id: 'user_idle',
        purpose: 'unwind',
        control_path: 'lending.withdraw',
        unit_allocations: [
          {
            unit_id: 'unit-ember-lending-001',
            quantity: '10',
          },
        ],
        status: 'active',
        created_at: '2026-04-01T06:00:00Z',
        released_at: null,
        superseded_by: null,
      },
    ],
    root_delegations: [
      {
        root_delegation_id: 'root-user-ember-lending-001',
        user_id: 'user_idle',
        user_wallet: TEST_EMBER_LENDING_USER_WALLET,
        orchestrator_wallet: TEST_EMBER_LENDING_ORCHESTRATOR_WALLET,
        network: 'arbitrum',
        status: 'active',
        issued_at: '2026-04-01T06:00:00Z',
        activated_at: '2026-04-01T06:00:05Z',
        revoked_at: null,
        artifact_ref: 'artifact-root-ember-lending-001',
        metadata: {},
      },
    ],
    rooted_wallet_contexts: [
      {
        rooted_wallet_context_id: 'rwc-ember-lending-001',
        user_id: 'user_idle',
        wallet_address: TEST_EMBER_LENDING_USER_WALLET,
        network: 'arbitrum',
        registered_at: '2026-04-01T06:00:00Z',
        metadata: {
          source: 'integration_harness',
        },
      },
    ],
    capital_observations: [],
    transaction_plans: [],
    delegation_plans: [],
    issued_delegations: [
      {
        delegation_id: 'del-ember-lending-001',
        delegation_plan_id: 'plan-ember-lending-001',
        root_delegation_id: 'root-user-ember-lending-001',
        delegator_address: TEST_EMBER_LENDING_ORCHESTRATOR_WALLET,
        agent_id: TEST_EMBER_LENDING_AGENT_ID,
        agent_wallet: TEST_EMBER_LENDING_AGENT_WALLET,
        status: 'active',
        reservation_ids: ['reservation-ember-lending-001'],
        unit_ids: ['unit-ember-lending-001'],
        control_paths: ['lending.withdraw'],
        network: 'arbitrum',
        issued_at: '2026-04-01T06:00:00Z',
        activated_at: '2026-04-01T06:00:05Z',
        revoked_at: null,
        superseded_by: null,
        zero_capacity: false,
        artifact_ref: 'artifact-ember-lending-001',
        policy_hash: 'hash-ember-lending-001',
        policy_snapshot_ref: 'pol-ember-lending-001',
      },
    ],
    delegation_executions: [],
    policy_snapshots: [
      {
        policy_snapshot_ref: 'pol-ember-lending-001',
        agent_id: TEST_EMBER_LENDING_AGENT_ID,
        network: 'arbitrum',
        control_paths: ['lending.withdraw'],
        unit_bounds: [
          {
            unit_id: 'unit-ember-lending-001',
            quantity: '10',
          },
        ],
        created_at: '2026-04-01T06:00:00Z',
      },
    ],
    mandates: [
      {
        mandate_ref: 'mandate-ember-lending-001',
        agent_id: TEST_EMBER_LENDING_AGENT_ID,
        mandate_summary: 'unwind the managed lending position and return capital',
      },
    ],
    user_reserve_policies: [],
    control_plane_decisions: [],
    exception_escalations: [],
    execution_ledger: [],
    ownership_transfers: [],
    valuation_refs: [],
    agent_service_identities: [
      {
        identity_ref: 'agent-identity-ember-lending-001',
        agent_id: TEST_EMBER_LENDING_AGENT_ID,
        role: 'subagent',
        wallet_address: TEST_EMBER_LENDING_AGENT_WALLET,
        wallet_source: 'ember_local_write',
        capability_metadata: {
          execution: true,
          onboarding: true,
        },
        registration_version: 1,
        registered_at: '2026-04-01T05:59:30Z',
      },
    ],
  };
}

export function createSharedEmberExecutionSeed(
  options: SharedEmberExecutionSeedOptions = {},
): SharedEmberExecutionSeed {
  const seed = createBaseSharedEmberExecutionSeed();

  if (options.competingReservation) {
    seed.reservations = seed.reservations.map((reservation) => ({
      ...reservation,
      agent_id: 'competing-agent',
    }));
    seed.issued_delegations = seed.issued_delegations.map((delegation) => ({
      ...delegation,
      agent_id: 'competing-agent',
    }));
  }

  if (options.omitAgentServiceIdentity) {
    seed.agent_service_identities = [];
  }

  return seed;
}

function createSubagentRuntime() {
  const executionPayload: HarnessExecutionPayloadArtifact = {
    action: 'raw',
    transaction_payload_ref: 'txpayload-handoff-ember-lending-int-001',
    required_control_path: 'lending.withdraw',
    network: 'arbitrum',
    target: '0x00000000000000000000000000000000000000c1',
    callData: '0xdeadbeef',
  };

  return {
    agentWallet: TEST_EMBER_LENDING_AGENT_WALLET,
    payloadStore: {
      async getExecutionPayload(_plannedTransactionPayloadRef: string) {
        return executionPayload;
      },
    },
    issuer: {
      async issueDelegation(input: { requestId: string }) {
        return {
          delegationId: `del-issued-${input.requestId}`,
          artifactRef: `artifact-issued-${input.requestId}`,
          issuedAt: '2026-04-01T06:16:00Z',
          activatedAt: '2026-04-01T06:16:05Z',
          policyHash: `hash-issued-${input.requestId}`,
        };
      },
    },
    delegationClient: {
      async redeemActiveDelegation() {
        return {
          redeemedDelegationId: 'del-ember-lending-001',
          delegationArtifactRef: 'artifact-ember-lending-001',
          redeemerAddress: TEST_EMBER_LENDING_AGENT_WALLET,
          transactionHash:
            '0x4444444444444444444444444444444444444444444444444444444444444444',
        };
      },
    },
    executor: {
      async signDelegatedPayload() {
        return {
          signedPayloadRef: 'signed-ember-lending-001',
          signerAddress: TEST_EMBER_LENDING_AGENT_WALLET,
        };
      },
    },
    chainAdapter: {
      async submitSignedPayload() {
        return {
          kind: 'confirmed' as const,
          execution_id: 'exec-ember-lending-integration-001',
          occurred_at: '2026-04-01T06:18:00Z',
          transaction_hash:
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          successor_plans: [
            {
              unit_id: 'unit-ember-lending-successor-001',
              root_asset: 'USDC',
              network: 'arbitrum',
              wallet_address: TEST_EMBER_LENDING_AGENT_WALLET,
              quantity: '10',
              position_kind: 'loan' as const,
              control_path: 'lending.withdraw' as const,
              benchmark_value: '10',
              valuation_ref: 'val-ember-lending-successor-001',
              metadata: {
                protocol_name: 'Integration Protocol',
              },
            },
          ],
        };
      },
    },
    submissionBackend: {
      async submitSignedTransaction() {
        return {
          kind: 'confirmed' as const,
          execution_id: 'exec-ember-lending-integration-001',
          occurred_at: '2026-04-01T06:18:00Z',
          transaction_hash:
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          successor_plans: [
            {
              unit_id: 'unit-ember-lending-successor-001',
              root_asset: 'USDC',
              network: 'arbitrum',
              wallet_address: TEST_EMBER_LENDING_AGENT_WALLET,
              quantity: '10',
              position_kind: 'loan' as const,
              control_path: 'lending.withdraw' as const,
              benchmark_value: '10',
              valuation_ref: 'val-ember-lending-successor-001',
              metadata: {
                protocol_name: 'Integration Protocol',
              },
            },
          ],
        };
      },
    },
  };
}

export async function resolveSharedEmberTarget(input?: {
  bootstrap?: SharedEmberIntegrationBootstrap;
}): Promise<StartedSharedEmberTarget> {
  const explicitBaseUrl = process.env['SHARED_EMBER_BASE_URL']?.trim();
  if (explicitBaseUrl) {
    return {
      baseUrl: explicitBaseUrl,
      close: async () => undefined,
    };
  }

  const privateRepoRoot = process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT']?.trim();
  if (!privateRepoRoot) {
    throw new Error(
      'Set SHARED_EMBER_BASE_URL or EMBER_ORCHESTRATION_V1_SPEC_ROOT when RUN_SHARED_EMBER_INT=1.',
    );
  }

  if (!existsSync(path.join(privateRepoRoot, 'node_modules'))) {
    throw new Error(
      'The private ember-orchestration-v1-spec repo must have dependencies installed before running shared Ember integration tests.',
    );
  }

  const harnessModule = (await import(
    pathToFileURL(path.join(privateRepoRoot, 'scripts/shared-domain-service-repo-harness.ts')).href
  )) as {
    startRepoLocalSharedEmberDomainProtocolHttpServer: (input?: {
      bootstrap?: unknown;
    }) => Promise<StartedSharedEmberTarget>;
  };

  const bootstrap = {
    initialState: input?.bootstrap?.initialState ?? createSharedEmberExecutionSeed(),
    subagentRuntimes: input?.bootstrap?.subagentRuntimes ?? {
      [TEST_EMBER_LENDING_AGENT_ID]: createSubagentRuntime(),
    },
  };

  const startedTarget = await harnessModule.startRepoLocalSharedEmberDomainProtocolHttpServer({
    bootstrap,
  });

  return {
    ...startedTarget,
    anchoredPayloadResolver: createAnchoredPayloadResolver({
      bootstrap,
      defaultAgentId: TEST_EMBER_LENDING_AGENT_ID,
    }),
  };
}
