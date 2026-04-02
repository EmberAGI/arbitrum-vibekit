import { describe, expect, it, vi } from 'vitest';

import { ensurePortfolioManagerServiceIdentity } from './serviceIdentityPreflight.js';

describe('ensurePortfolioManagerServiceIdentity', () => {
  it('reuses the durable orchestrator identity when the OWS controller wallet already matches', async () => {
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
            revision: 7,
            agent_service_identity: {
              identity_ref: 'agent-service-identity-portfolio-manager-orchestrator-3',
              agent_id: 'portfolio-manager',
              role: 'orchestrator',
              wallet_address: '0x00000000000000000000000000000000000000c1',
              wallet_source: 'ember_local_write',
              capability_metadata: {
                onboarding: true,
                root_registration: true,
              },
              registration_version: 3,
              registered_at: '2026-04-01T09:30:00.000Z',
            },
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensurePortfolioManagerServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readControllerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000c1' as const,
        ),
      }),
    ).resolves.toMatchObject({
      revision: 7,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c1',
        registration_version: 3,
      },
    });

    expect(handleJsonRpc).toHaveBeenCalledTimes(1);
  });

  it('registers the durable orchestrator identity when Shared Ember has no current record', async () => {
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
            revision: 2,
            agent_service_identity: null,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        expect(jsonRpcRequest.params?.['idempotency_key']).toBe(
          'idem-portfolio-manager-orchestrator-service-identity-startup',
        );
        expect(jsonRpcRequest.params?.['expected_revision']).toBe(2);
        expect(jsonRpcRequest.params?.['agent_service_identity']).toMatchObject({
          identity_ref: 'agent-service-identity-portfolio-manager-orchestrator-1',
          agent_id: 'portfolio-manager',
          role: 'orchestrator',
          wallet_address: '0x00000000000000000000000000000000000000c1',
          wallet_source: 'ember_local_write',
          capability_metadata: {
            onboarding: true,
            root_registration: true,
          },
          registration_version: 1,
          registered_at: '2026-04-02T09:30:00.000Z',
        });

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 3,
            committed_event_ids: ['evt-agent-service-identity-1'],
            agent_service_identity: jsonRpcRequest.params?.['agent_service_identity'],
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensurePortfolioManagerServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readControllerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000c1' as const,
        ),
        now: () => new Date('2026-04-02T09:30:00.000Z'),
      }),
    ).resolves.toMatchObject({
      revision: 3,
      wroteIdentity: true,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c1',
        registration_version: 1,
      },
    });
  });

  it('rotates the durable orchestrator identity when the local OWS controller wallet changes', async () => {
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
            revision: 7,
            agent_service_identity: {
              identity_ref: 'agent-service-identity-portfolio-manager-orchestrator-3',
              agent_id: 'portfolio-manager',
              role: 'orchestrator',
              wallet_address: '0x00000000000000000000000000000000000000c0',
              wallet_source: 'ember_local_write',
              capability_metadata: {
                onboarding: true,
                root_registration: true,
              },
              registration_version: 3,
              registered_at: '2026-04-01T09:30:00.000Z',
            },
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        expect(jsonRpcRequest.params?.['expected_revision']).toBe(7);
        expect(jsonRpcRequest.params?.['agent_service_identity']).toMatchObject({
          identity_ref: 'agent-service-identity-portfolio-manager-orchestrator-4',
          agent_id: 'portfolio-manager',
          role: 'orchestrator',
          wallet_address: '0x00000000000000000000000000000000000000c1',
          registration_version: 4,
          registered_at: '2026-04-02T10:00:00.000Z',
        });

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 8,
            committed_event_ids: ['evt-agent-service-identity-2'],
            agent_service_identity: jsonRpcRequest.params?.['agent_service_identity'],
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensurePortfolioManagerServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readControllerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000c1' as const,
        ),
        now: () => new Date('2026-04-02T10:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      revision: 8,
      wroteIdentity: true,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000c1',
        registration_version: 4,
      },
    });
  });
});
