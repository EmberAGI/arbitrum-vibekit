import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import matter from 'gray-matter';
import { describe, it, expect } from 'vitest';

import { renderAgentMdTemplate } from '../../src/cli/commands/init.js';

function loadTemplate(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
}

describe('renderAgentMdTemplate', () => {
  const tpl = loadTemplate('../../src/cli/templates/config-workspace/agent.md');

  it('renders placeholders and includes ERC-8004 when enabled', () => {
    // Given: a template and config with ERC-8004 enabled and mirrors set
    const content = renderAgentMdTemplate(tpl, {
      agentName: 'My Agent',
      agentDescription: 'An AI agent built with the config-driven composition system',
      agentVersion: '1.0.0',
      providerName: 'Ember AI',
      providerUrl: 'https://emberai.xyz/',
      agentBaseUrl: 'http://localhost:3000',
      aiProvider: 'openrouter',
      aiModel: 'openai/gpt-5',
      enableErc8004: true,
      canonicalChain: 42161,
      mirrorChains: [1, 8453],
      operatorAddress: undefined,
      secrets: {},
    });

    // When: parsing frontmatter
    const parsed = matter(content);

    // Then: placeholders resolved and ERC-8004 block present
    expect(parsed.data['card']).toBeDefined();
    expect(parsed.data['card']['name']).toBe('My Agent');
    expect(parsed.data['ai']).toBeDefined();
    expect(parsed.data['ai']['modelProvider']).toBe('openrouter');
    expect(parsed.data['ai']['model']).toBe('openai/gpt-5');
    expect(parsed.data['erc8004']).toBeDefined();
    expect(parsed.data['erc8004']['enabled']).toBe(true);
    expect(parsed.data['erc8004']['canonical']['chainId']).toBe(42161);
    const mirrors = parsed.data['erc8004']['mirrors'].map((m: { chainId: number }) => m.chainId);
    expect(mirrors).toContain(1);
    expect(mirrors).toContain(8453);
    // And: ERC markers removed when included
    expect(content).not.toMatch(/ERC8004:START/);
  });

  it('omits ERC-8004 from frontmatter when disabled (block remains commented)', () => {
    // Given: ERC-8004 disabled
    const content = renderAgentMdTemplate(tpl, {
      agentName: 'My Agent',
      agentDescription: 'An AI agent built with the config-driven composition system',
      agentVersion: '1.0.0',
      providerName: 'Ember AI',
      providerUrl: 'https://emberai.xyz/',
      agentBaseUrl: 'http://localhost:3000',
      aiProvider: 'openrouter',
      aiModel: 'openai/gpt-5',
      enableErc8004: false,
      canonicalChain: 42161,
      mirrorChains: [],
      operatorAddress: undefined,
      secrets: {},
    });

    // When: parsing frontmatter
    const parsed = matter(content);

    // Then: ERC-8004 is not in frontmatter; commented hint stays in file
    expect(parsed.data['erc8004']).toBeUndefined();
    expect(content).toMatch(/ERC8004:START/);
  });

  it('includes provider block when providerName is set; drops url line if absent', () => {
    // Given: provider name set but url omitted
    const content = renderAgentMdTemplate(tpl, {
      agentName: 'Agent',
      agentDescription: 'Desc',
      agentVersion: '1.0.0',
      providerName: 'ProviderX',
      providerUrl: undefined,
      agentBaseUrl: 'http://localhost:3000',
      aiProvider: 'openrouter',
      aiModel: 'openai/gpt-5',
      enableErc8004: false,
      canonicalChain: 42161,
      mirrorChains: [],
      operatorAddress: undefined,
      secrets: {},
    });

    // Then: provider name included, url line omitted
    const parsed = matter(content);
    expect(parsed.data['card']['provider']).toBeDefined();
    expect(parsed.data['card']['provider']['name']).toBe('ProviderX');
    expect(parsed.data['card']['provider']['url']).toBeUndefined();
  });

  it('removes provider block when providerName is not set', () => {
    // Given: no provider name/url
    const content = renderAgentMdTemplate(tpl, {
      agentName: 'Agent',
      agentDescription: 'Desc',
      agentVersion: '1.0.0',
      providerName: undefined,
      providerUrl: undefined,
      agentBaseUrl: 'http://localhost:3000',
      aiProvider: 'openrouter',
      aiModel: 'openai/gpt-5',
      enableErc8004: false,
      canonicalChain: 42161,
      mirrorChains: [],
      operatorAddress: undefined,
      secrets: {},
    });

    // Then: provider not present in frontmatter
    const parsed = matter(content);
    expect(parsed.data['card']['provider']).toBeUndefined();
  });

  it('includes operatorAddress when provided and renders empty mirrors as []', () => {
    // Given: ERC-8004 enabled, operator provided, no mirrors
    const content = renderAgentMdTemplate(tpl, {
      agentName: 'Agent',
      agentDescription: 'Desc',
      agentVersion: '1.0.0',
      providerName: undefined,
      providerUrl: undefined,
      agentBaseUrl: 'http://localhost:3000',
      aiProvider: 'openrouter',
      aiModel: 'openai/gpt-5',
      enableErc8004: true,
      canonicalChain: 42161,
      mirrorChains: [],
      operatorAddress: '0x000000000000000000000000000000000000dEaD',
      secrets: {},
    });

    // When: parsing frontmatter
    const parsed = matter(content);

    // Then: operatorAddress included and mirrors empty
    expect(parsed.data['erc8004']['canonical']['operatorAddress']).toBe(
      '0x000000000000000000000000000000000000dEaD',
    );
    expect(parsed.data['erc8004']['mirrors']).toEqual([]);
  });
});
