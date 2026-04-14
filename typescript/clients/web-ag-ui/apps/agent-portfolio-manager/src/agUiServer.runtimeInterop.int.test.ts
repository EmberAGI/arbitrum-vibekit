import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('agent-portfolio-manager runtime interop', () => {
  it(
    'serves the initial hire run when started through tsx package resolution',
    async () => {
      const packageRoot = process.cwd();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-portfolio-manager-runtime-interop-'));
      const scriptPath = path.join(tempDir, 'runtime-interop.mjs');
      const agUiServerUrl = pathToFileURL(path.join(packageRoot, 'src', 'agUiServer.ts')).href;
      const sharedEmberAdapterUrl = pathToFileURL(
        path.join(packageRoot, 'src', 'sharedEmberAdapter.ts'),
      ).href;

      try {
        await writeFile(
          scriptPath,
          `
import {
  createPortfolioManagerAgUiHandler,
  createPortfolioManagerGatewayService,
  PORTFOLIO_MANAGER_AGENT_ID,
} from ${JSON.stringify(agUiServerUrl)};
import { createPortfolioManagerDomain } from ${JSON.stringify(sharedEmberAdapterUrl)};

const service = await createPortfolioManagerGatewayService({
  runtimeConfig: {
    model: {
      id: 'openai/gpt-5.4-mini',
      name: 'openai/gpt-5.4-mini',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
    },
    systemPrompt: 'Portfolio manager runtime interop test.',
    tools: [],
    domain: createPortfolioManagerDomain({
      protocolHost: {
        handleJsonRpc: async () => {
          throw new Error('Unexpected Shared Ember JSON-RPC request during hire flow.');
        },
        readCommittedEventOutbox: async () => ({
          protocol_version: 'v1',
          revision: 0,
          events: [],
        }),
        acknowledgeCommittedEventOutbox: async () => ({
          protocol_version: 'v1',
          revision: 0,
          consumer_id: 'portfolio-manager',
          acknowledged_through_sequence: 0,
        }),
      },
      agentId: 'portfolio-manager',
      controllerWalletAddress: '0x3b32650cefcb53bf0365058c5576d70226225fc4',
    }),
    agentOptions: {
      initialState: {
        thinkingLevel: 'low',
      },
      getApiKey: () => 'test-openrouter-key',
    },
  },
  __internalPostgres: {
    ensureReady: async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    }),
    loadInspectionState: async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    }),
    executeStatements: async () => undefined,
    persistDirectExecution: async () => undefined,
  },
});

const handler = createPortfolioManagerAgUiHandler({
  agentId: PORTFOLIO_MANAGER_AGENT_ID,
  service,
});

const response = await handler(new Request('http://127.0.0.1/ag-ui/agent/agent-portfolio-manager/run', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    threadId: 'thread-runtime-interop-1',
    runId: 'run-runtime-interop-1',
    forwardedProps: {
      command: {
        name: 'hire',
      },
    },
  }),
  duplex: 'half',
}));

console.log('status', response.status);
console.log(await response.text());
          `,
          'utf8',
        );

        const child = spawn(process.execPath, ['./node_modules/tsx/dist/cli.mjs', scriptPath], {
          cwd: packageRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });

        const [exitCode] = (await once(child, 'close')) as [number | null, NodeJS.Signals | null];

        expect({
          exitCode,
          stdout,
          stderr,
        }).toMatchObject({
          exitCode: 0,
        });
        expect(stdout).toContain('status 200');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
