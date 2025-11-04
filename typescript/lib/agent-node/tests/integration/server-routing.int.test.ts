import { readFileSync, rmSync, writeFileSync } from 'fs';
import type { Server } from 'http';
import { join } from 'path';

import matter from 'gray-matter';
import { describe, it, expect, afterEach } from 'vitest';

import { createA2AServer } from '../../src/a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import { serviceConfig } from '../../src/config.js';
import { createTestConfigWorkspace } from '../utils/test-config-workspace.js';

describe('A2A Server - routing.agentCardPath and card.url composition', () => {
  let server: Server | null = null;
  let agentConfigHandle: AgentConfigHandle | null = null;
  let baseUrl = '';
  let configDir = '';

  const start = async () => {
    agentConfigHandle = await initFromConfigWorkspace({ root: configDir, dev: false });
    server = await createA2AServer({ serviceConfig, agentConfig: agentConfigHandle });
    await new Promise<void>((resolve) => {
      if (server!.listening) resolve();
      else server!.once('listening', () => resolve());
    });
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === 'object' ? address?.port : 0}`;
  };

  const stop = async () => {
    if (agentConfigHandle) await agentConfigHandle.close();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    agentConfigHandle = null;
  };

  afterEach(async () => {
    await stop();
    if (configDir) {
      try {
        rmSync(configDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('serves Agent Card at default path; card.url preserves A2A endpoint', async () => {
    configDir = createTestConfigWorkspace();
    // Ensure new 'ai' block exists (replace legacy 'model')
    {
      const agentMdPath = join(configDir, 'agent.md');
      const parsedAi = matter(readFileSync(agentMdPath, 'utf-8'));
      if (parsedAi.data['model']) delete parsedAi.data['model'];
      parsedAi.data['ai'] = {
        modelProvider: 'openrouter',
        model: 'openai/gpt-5',
        params: { temperature: 0.7, maxTokens: 4096 },
      };
      writeFileSync(agentMdPath, matter.stringify(parsedAi.content, parsedAi.data));
    }
    await start();

    const res = await fetch(`${baseUrl}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.url).toBe(`${baseUrl}/a2a`);
  });

  it('serves Agent Card at custom routing.agentCardPath and redirects from default', async () => {
    configDir = createTestConfigWorkspace();
    const agentMdPath = join(configDir, 'agent.md');
    // Ensure new 'ai' block exists
    {
      const parsedAi = matter(readFileSync(agentMdPath, 'utf-8'));
      if (parsedAi.data['model']) delete parsedAi.data['model'];
      parsedAi.data['ai'] = {
        modelProvider: 'openrouter',
        model: 'openai/gpt-5',
        params: { temperature: 0.7, maxTokens: 4096 },
      };
      writeFileSync(agentMdPath, matter.stringify(parsedAi.content, parsedAi.data));
    }
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['routing'] = { agentCardPath: '/prefix/.well-known/agent-card.json' };
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161, operatorAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
      mirrors: [],
      identityRegistries: {},
      registrations: {},
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    await start();

    const resDefault = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
      // Node fetch supports 'manual' but types may vary; cast to any to avoid TS constraint in tests
      redirect: 'manual' as any,
    });
    expect(resDefault.status).toBe(308);
    expect(resDefault.headers.get('location')).toBe('/prefix/.well-known/agent-card.json');

    const resCustom = await fetch(`${baseUrl}/prefix/.well-known/agent-card.json`);
    expect(resCustom.status).toBe(200);
    const card = await resCustom.json();
    expect(card.url).toBe(`${baseUrl}/a2a`);

    const ext = (card.capabilities?.extensions ?? []).find(
      (e: { uri?: string }) => e?.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
    );
    expect(ext).toBeDefined();
  });
});
