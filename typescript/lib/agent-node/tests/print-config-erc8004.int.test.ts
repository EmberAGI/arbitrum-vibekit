/**
 * Integration tests for print-config ERC-8004 visibility
 */

import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import matter from 'gray-matter';
import { describe, it, expect, afterEach } from 'vitest';

import { printConfigCommand } from '../src/cli/commands/print-config.js';
import { createTestConfigWorkspace } from './utils/test-config-workspace.js';

describe('print-config ERC-8004 visibility', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    tempDirs.length = 0;
  });

  it('should include ERC-8004 summary and extension with params', async () => {
    // Given: a config with ERC-8004 fully configured
    const configDir = createTestConfigWorkspace({ agentName: 'PrintConfig 8004 Agent' });
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    // Ensure new 'ai' block exists (replace legacy 'model')
    {
      const parsedAi = matter(readFileSync(agentMdPath, 'utf-8'));
      if (parsedAi.data['model']) delete parsedAi.data['model'];
      parsedAi.data['ai'] = {
        modelProvider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
        params: { temperature: 0.7, maxTokens: 4096 },
      };
      writeFileSync(agentMdPath, matter.stringify(parsedAi.content, parsedAi.data));
    }
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161, operatorAddress: '0x1234567890123456789012345678901234567890' },
      mirrors: [{ chainId: 1 }, { chainId: 8453 }],
      identityRegistries: { '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
      registrations: { '42161': { agentId: 456, registrationUri: 'ipfs://QmFullConfig' } },
      supportedTrust: ['dns', 'ens', 'lens'],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (line: string) => logs.push(line);
    try {
      await printConfigCommand({ configDir, format: 'json' });
    } finally {
      console.log = originalLog;
    }

    const jsonLine = logs.find((l) => l.trimStart().startsWith('{'));
    expect(jsonLine).toBeDefined();
    const out = JSON.parse(jsonLine!);

    // Summary.erc8004
    expect(out.summary?.erc8004?.enabled).toBe(true);
    expect(out.summary?.erc8004?.canonicalCaip10).toBe(
      'eip155:42161:0x1234567890123456789012345678901234567890',
    );
    expect(out.summary?.erc8004?.identityRegistry).toBe(
      'eip155:42161:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    expect(out.summary?.erc8004?.registrationUri).toBe('ipfs://QmFullConfig');
    expect(out.summary?.erc8004?.supportedTrustCount).toBe(3);

    // Agent Card extension
    const extensions = out.agentCard?.capabilities?.extensions ?? [];
    const ext = extensions.find(
      (e: { uri?: string }) => e?.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
    );
    expect(ext).toBeDefined();
    expect(ext.description).toBe('ERC-8004 discovery/trust');
    expect(ext.required).toBe(false);
    expect(ext.params?.canonicalCaip10).toBe(
      'eip155:42161:0x1234567890123456789012345678901234567890',
    );
    expect(ext.params?.identityRegistry).toBe(
      'eip155:42161:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    expect(ext.params?.registrationUri).toBe('ipfs://QmFullConfig');
    expect(ext.params?.supportedTrust).toEqual(['dns', 'ens', 'lens']);
  });
});
