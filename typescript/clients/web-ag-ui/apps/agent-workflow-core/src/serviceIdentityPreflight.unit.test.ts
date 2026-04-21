import { describe, expect, it, vi } from 'vitest';

import { ensureAgentServiceIdentity } from './index.js';

describe('ensureAgentServiceIdentity', () => {
  it('reuses the durable service identity when the expected wallet already matches', async () => {
    const handleJsonRpc = vi.fn(async (request: unknown) => {
      const jsonRpcRequest =
        typeof request === 'object' && request !== null
          ? (request as { method?: string })
          : {};

      if (jsonRpcRequest.method === 'orchestrator.readAgentServiceIdentity.v1') {
        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-read',
          result: {
            protocol_version: 'v1',
            revision: 11,
            agent_service_identity: {
              identity_ref: 'agent-service-identity-pm-hidden-executor-subagent-2',
              agent_id: 'pm-hidden-executor',
              role: 'subagent',
              wallet_address: '0x00000000000000000000000000000000000000e1',
              wallet_source: 'ember_local_write',
              capability_metadata: {
                visibility: 'internal',
                owner_agent_id: 'agent-portfolio-manager',
                worker_kind: 'execution',
              },
              registration_version: 2,
              registered_at: '2026-04-01T09:30:00.000Z',
            },
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureAgentServiceIdentity({
        protocolHost: {
          handleJsonRpc,
        },
        agentId: 'pm-hidden-executor',
        role: 'subagent',
        walletSource: 'ember_local_write',
        capabilityMetadata: {
          visibility: 'internal',
          owner_agent_id: 'agent-portfolio-manager',
          worker_kind: 'execution',
        },
        readWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000e1' as const,
        ),
        unconfirmedIdentityErrorMessage:
          'Hidden executor identity preflight failed because Shared Ember did not confirm the expected internal execution-worker identity.',
      }),
    ).resolves.toMatchObject({
      revision: 11,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000e1',
        registration_version: 2,
      },
    });

    expect(handleJsonRpc).toHaveBeenCalledTimes(1);
  });

  it('registers a new durable identity when Shared Ember has no current record', async () => {
    const handleJsonRpc = vi.fn(async (request: unknown) => {
      const jsonRpcRequest =
        typeof request === 'object' && request !== null
          ? (request as { method?: string; params?: Record<string, unknown> })
          : {};

      if (jsonRpcRequest.method === 'orchestrator.readAgentServiceIdentity.v1') {
        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-read',
          result: {
            protocol_version: 'v1',
            revision: 3,
            agent_service_identity: null,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        expect(jsonRpcRequest.params?.['idempotency_key']).toBe(
          'idem-agent-service-identity-agent-service-identity-pm-hidden-executor-subagent-1',
        );
        expect(jsonRpcRequest.params?.['expected_revision']).toBe(3);
        expect(jsonRpcRequest.params?.['agent_service_identity']).toMatchObject({
          identity_ref: 'agent-service-identity-pm-hidden-executor-subagent-1',
          agent_id: 'pm-hidden-executor',
          role: 'subagent',
          wallet_address: '0x00000000000000000000000000000000000000e1',
          wallet_source: 'ember_local_write',
          capability_metadata: {
            visibility: 'internal',
            owner_agent_id: 'agent-portfolio-manager',
            worker_kind: 'execution',
          },
          registration_version: 1,
          registered_at: '2026-04-02T12:00:00.000Z',
        });

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 4,
            committed_event_ids: ['evt-agent-service-identity-1'],
            agent_service_identity: jsonRpcRequest.params?.['agent_service_identity'],
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureAgentServiceIdentity({
        protocolHost: {
          handleJsonRpc,
        },
        agentId: 'pm-hidden-executor',
        role: 'subagent',
        walletSource: 'ember_local_write',
        capabilityMetadata: {
          visibility: 'internal',
          owner_agent_id: 'agent-portfolio-manager',
          worker_kind: 'execution',
        },
        readWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000e1' as const,
        ),
        now: () => new Date('2026-04-02T12:00:00.000Z'),
        unconfirmedIdentityErrorMessage:
          'Hidden executor identity preflight failed because Shared Ember did not confirm the expected internal execution-worker identity.',
      }),
    ).resolves.toMatchObject({
      revision: 4,
      wroteIdentity: true,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000e1',
        registration_version: 1,
      },
    });
  });
});
