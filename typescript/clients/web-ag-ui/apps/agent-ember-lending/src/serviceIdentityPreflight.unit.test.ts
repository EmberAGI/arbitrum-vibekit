import { describe, expect, it, vi } from 'vitest';

import { ensureEmberLendingServiceIdentity } from './serviceIdentityPreflight.js';

describe('ensureEmberLendingServiceIdentity', () => {
  it('reuses the durable subagent identity when the OWS signer wallet already matches', async () => {
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
            revision: 6,
            agent_service_identity: {
              identity_ref: 'agent-service-identity-ember-lending-subagent-2',
              agent_id: 'ember-lending',
              role: 'subagent',
              wallet_address: '0x00000000000000000000000000000000000000b1',
              wallet_source: 'ember_local_write',
              capability_metadata: {
                execution: true,
                onboarding: true,
              },
              registration_version: 2,
              registered_at: '2026-04-01T09:00:00.000Z',
            },
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureEmberLendingServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readSignerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000b1',
        ),
      }),
    ).resolves.toMatchObject({
      revision: 6,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
        registration_version: 2,
      },
    });

    expect(handleJsonRpc).toHaveBeenCalledTimes(1);
  });

  it('registers the durable subagent identity when Shared Ember has no current record', async () => {
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
            revision: 4,
            agent_service_identity: null,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        expect(jsonRpcRequest.params?.idempotency_key).toBe(
          'idem-agent-service-identity-agent-service-identity-ember-lending-subagent-1',
        );
        expect(jsonRpcRequest.params?.expected_revision).toBe(4);
        expect(jsonRpcRequest.params?.agent_service_identity).toMatchObject({
          identity_ref: 'agent-service-identity-ember-lending-subagent-1',
          agent_id: 'ember-lending',
          role: 'subagent',
          wallet_address: '0x00000000000000000000000000000000000000b1',
          wallet_source: 'ember_local_write',
          capability_metadata: {
            execution: true,
            onboarding: true,
          },
          registration_version: 1,
          registered_at: '2026-04-02T09:00:00.000Z',
        });

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 5,
            committed_event_ids: ['evt-agent-service-identity-1'],
            agent_service_identity: jsonRpcRequest.params?.agent_service_identity,
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureEmberLendingServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readSignerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000b1',
        ),
        now: () => new Date('2026-04-02T09:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      revision: 5,
      wroteIdentity: true,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
        registration_version: 1,
      },
    });
  });

  it('rotates the durable subagent identity when the configured OWS signer wallet changes', async () => {
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
            revision: 6,
            agent_service_identity: {
              identity_ref: 'agent-service-identity-ember-lending-subagent-2',
              agent_id: 'ember-lending',
              role: 'subagent',
              wallet_address: '0x00000000000000000000000000000000000000b0',
              wallet_source: 'ember_local_write',
              capability_metadata: {
                execution: true,
                onboarding: true,
              },
              registration_version: 2,
              registered_at: '2026-04-01T09:00:00.000Z',
            },
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        expect(jsonRpcRequest.params?.expected_revision).toBe(6);
        expect(jsonRpcRequest.params?.agent_service_identity).toMatchObject({
          identity_ref: 'agent-service-identity-ember-lending-subagent-3',
          agent_id: 'ember-lending',
          role: 'subagent',
          wallet_address: '0x00000000000000000000000000000000000000b1',
          registration_version: 3,
          registered_at: '2026-04-02T09:15:00.000Z',
        });

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 7,
            committed_event_ids: ['evt-agent-service-identity-2'],
            agent_service_identity: jsonRpcRequest.params?.agent_service_identity,
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureEmberLendingServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readSignerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000b1',
        ),
        now: () => new Date('2026-04-02T09:15:00.000Z'),
      }),
    ).resolves.toMatchObject({
      revision: 7,
      wroteIdentity: true,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
        registration_version: 3,
      },
    });
  });

  it('uses a distinct idempotency key for each distinct subagent identity write', async () => {
    const writeKeys: string[] = [];
    const readResponses = [
      {
        revision: 4,
        agent_service_identity: null,
      },
      {
        revision: 5,
        agent_service_identity: {
          identity_ref: 'agent-service-identity-ember-lending-subagent-1',
          agent_id: 'ember-lending',
          role: 'subagent',
          wallet_address: '0x00000000000000000000000000000000000000b1',
          wallet_source: 'ember_local_write',
          capability_metadata: {
            execution: true,
            onboarding: true,
          },
          registration_version: 1,
          registered_at: '2026-04-02T09:00:00.000Z',
        },
      },
    ];
    const handleJsonRpc = vi.fn(async (request: unknown) => {
      const jsonRpcRequest =
        typeof request === 'object' && request !== null
          ? (request as { method?: string; params?: Record<string, unknown> })
          : {};

      if (jsonRpcRequest.method === 'orchestrator.readAgentServiceIdentity.v1') {
        const nextRead = readResponses.shift();
        if (!nextRead) {
          throw new Error('expected another read response');
        }

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-read',
          result: {
            protocol_version: 'v1',
            revision: nextRead.revision,
            agent_service_identity: nextRead.agent_service_identity,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        const idempotencyKey = jsonRpcRequest.params?.idempotency_key;
        if (typeof idempotencyKey !== 'string') {
          throw new Error('expected write idempotency key');
        }

        writeKeys.push(idempotencyKey);

        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: writeKeys.length + 4,
            committed_event_ids: [`evt-agent-service-identity-${writeKeys.length}`],
            agent_service_identity: jsonRpcRequest.params?.agent_service_identity,
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await ensureEmberLendingServiceIdentity({
      protocolHost: {
        handleJsonRpc,
        readCommittedEventOutbox: vi.fn(),
        acknowledgeCommittedEventOutbox: vi.fn(),
      },
      readSignerWalletAddress: vi.fn(
        async () => '0x00000000000000000000000000000000000000b1',
      ),
      now: () => new Date('2026-04-02T09:00:00.000Z'),
    });

    await ensureEmberLendingServiceIdentity({
      protocolHost: {
        handleJsonRpc,
        readCommittedEventOutbox: vi.fn(),
        acknowledgeCommittedEventOutbox: vi.fn(),
      },
      readSignerWalletAddress: vi.fn(
        async () => '0x00000000000000000000000000000000000000b2',
      ),
      now: () => new Date('2026-04-02T10:00:00.000Z'),
    });

    expect(writeKeys).toEqual([
      'idem-agent-service-identity-agent-service-identity-ember-lending-subagent-1',
      'idem-agent-service-identity-agent-service-identity-ember-lending-subagent-2',
    ]);
    expect(new Set(writeKeys)).toHaveLength(2);
  });

  it('fails when Shared Ember does not confirm the written subagent identity', async () => {
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
            revision: 4,
            agent_service_identity: null,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 5,
            agent_service_identity: null,
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureEmberLendingServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readSignerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000b1',
        ),
        now: () => new Date('2026-04-02T09:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because Shared Ember did not confirm the expected subagent identity.',
    );
  });

  it('fails when Shared Ember echoes the wrong role for the written subagent identity', async () => {
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
            revision: 4,
            agent_service_identity: null,
          },
        };
      }

      if (jsonRpcRequest.method === 'orchestrator.writeAgentServiceIdentity.v1') {
        return {
          jsonrpc: '2.0',
          id: 'rpc-agent-service-identity-write',
          result: {
            protocol_version: 'v1',
            revision: 5,
            agent_service_identity: {
              ...(jsonRpcRequest.params?.agent_service_identity as Record<string, unknown>),
              role: 'orchestrator',
            },
          },
        };
      }

      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(jsonRpcRequest.method)}`);
    });

    await expect(
      ensureEmberLendingServiceIdentity({
        protocolHost: {
          handleJsonRpc,
          readCommittedEventOutbox: vi.fn(),
          acknowledgeCommittedEventOutbox: vi.fn(),
        },
        readSignerWalletAddress: vi.fn(
          async () => '0x00000000000000000000000000000000000000b1',
        ),
        now: () => new Date('2026-04-02T09:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because Shared Ember did not confirm the expected subagent identity.',
    );
  });
});
