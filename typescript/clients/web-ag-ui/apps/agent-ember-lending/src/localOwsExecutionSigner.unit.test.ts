import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createEmberLendingLocalOwsExecutionSigner,
  resolveEmberLendingLocalOwsBaseUrl,
} from './localOwsExecutionSigner.js';

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString());
}

describe('createEmberLendingLocalOwsExecutionSigner', () => {
  let server: Server;
  let baseUrl: string;
  let responseStatus: number;
  let responseBody: unknown;

  beforeEach(async () => {
    responseStatus = 200;
    responseBody = null;
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/sign/execution' && request.url !== '/sign/redelegation') {
          response.writeHead(404);
          response.end();
          return;
        }

        response.writeHead(responseStatus, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify(
            responseBody ?? {
              ok: true,
              path: request.url,
              received: await readRequestBody(request),
            },
          ),
        );
      })().catch((error: unknown) => {
        response.writeHead(500);
        response.end(error instanceof Error ? error.message : 'unknown error');
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/`;
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('posts execution and redelegation signing payloads to the local OWS endpoints and trims trailing slashes', async () => {
    const signer = createEmberLendingLocalOwsExecutionSigner({
      baseUrl,
    });

    await expect(
      signer.signExecutionPackage({
        walletAddress: '0x00000000000000000000000000000000000000b1',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        executionSigningPackage: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
        },
      }),
    ).resolves.toEqual({
      ok: true,
      path: '/sign/execution',
      received: {
        walletAddress: '0x00000000000000000000000000000000000000b1',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        executionSigningPackage: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
        },
      },
    });

    await expect(
      signer.signRedelegationPackage({
        walletAddress: '0x00000000000000000000000000000000000000b1',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        redelegationSigningPackage: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          redelegation_intent_id: 'reintent-ember-lending-001',
          active_delegation_id: 'del-ember-lending-001',
          delegation_id: 'del-ember-lending-002',
          delegation_plan_id: 'plan-ember-lending-002',
          root_delegation_id: 'root-user-ember-lending-001',
          root_delegation_artifact_ref: 'artifact-root-ember-lending-001',
          delegator_address: '0x00000000000000000000000000000000000000a1',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          network: 'arbitrum',
          reservation_ids: ['reservation-ember-lending-001'],
          unit_ids: ['unit-ember-lending-001'],
          control_paths: ['lending.supply'],
          zero_capacity: false,
          policy_snapshot_ref: 'pol-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
        },
      }),
    ).resolves.toEqual({
      ok: true,
      path: '/sign/redelegation',
      received: {
        walletAddress: '0x00000000000000000000000000000000000000b1',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        redelegationSigningPackage: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          redelegation_intent_id: 'reintent-ember-lending-001',
          active_delegation_id: 'del-ember-lending-001',
          delegation_id: 'del-ember-lending-002',
          delegation_plan_id: 'plan-ember-lending-002',
          root_delegation_id: 'root-user-ember-lending-001',
          root_delegation_artifact_ref: 'artifact-root-ember-lending-001',
          delegator_address: '0x00000000000000000000000000000000000000a1',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          network: 'arbitrum',
          reservation_ids: ['reservation-ember-lending-001'],
          unit_ids: ['unit-ember-lending-001'],
          control_paths: ['lending.supply'],
          zero_capacity: false,
          policy_snapshot_ref: 'pol-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
        },
      },
    });
  });

  it('throws when the local OWS signer returns an application error payload with HTTP 200', async () => {
    responseBody = {
      message: 'execution signer unavailable',
    };

    const signer = createEmberLendingLocalOwsExecutionSigner({
      baseUrl,
    });

    await expect(
      signer.signExecutionPackage({
        walletAddress: '0x00000000000000000000000000000000000000b1',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        executionSigningPackage: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
        },
      }),
    ).rejects.toThrow('execution signer unavailable');
  });

  it('normalizes the optional local OWS base URL from env', () => {
    expect(
      resolveEmberLendingLocalOwsBaseUrl({
        EMBER_LENDING_OWS_BASE_URL: 'http://127.0.0.1:4020/',
      }),
    ).toBe('http://127.0.0.1:4020');
    expect(resolveEmberLendingLocalOwsBaseUrl({})).toBeNull();
  });
});
