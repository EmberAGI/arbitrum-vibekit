/**
 * Integration tests for Agent Card with ERC-8004 extension composition
 * Tests full config loading → composition → validation with ERC-8004 support
 */

import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, afterEach } from 'vitest';

import { loadAgentConfig } from '../src/config/orchestrator.js';

describe('Agent Card ERC-8004 Extension Integration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    // Clean up temp directories
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  /**
   * Helper to create a temp config workspace with ERC-8004 configuration
   */
  function createConfigWithErc8004(options: {
    enabled: boolean;
    canonical?: { chainId: number; operatorAddress?: string };
    mirrors?: Array<{ chainId: number }>;
    identityRegistries?: Record<string, string>;
    registrations?: Record<string, { agentId?: number; registrationUri?: string }>;
    supportedTrust?: string[];
  }): string {
    const tempDir = join(
      tmpdir(),
      `agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
    tempDirs.push(tempDir);

    // Create agent.md with ERC-8004 config
    const erc8004Block = `
erc8004:
  enabled: ${options.enabled}${
    options.canonical
      ? `
  canonical:
    chainId: ${options.canonical.chainId}${options.canonical.operatorAddress ? `\n    operatorAddress: '${options.canonical.operatorAddress}'` : ''}`
      : ''
  }${
    options.mirrors && options.mirrors.length > 0
      ? `
  mirrors:${options.mirrors.map((m) => `\n    - chainId: ${m.chainId}`).join('')}`
      : ''
  }${
    options.identityRegistries && Object.keys(options.identityRegistries).length > 0
      ? `
  identityRegistries:${Object.entries(options.identityRegistries)
    .map(([chainId, address]) => `\n    '${chainId}': '${address}'`)
    .join('')}`
      : ''
  }${
    options.registrations && Object.keys(options.registrations).length > 0
      ? `
  registrations:${Object.entries(options.registrations)
    .map(
      ([chainId, reg]) =>
        `\n    '${chainId}':\n      agentId: ${reg.agentId ?? 'null'}\n      registrationUri: ${reg.registrationUri ? `'${reg.registrationUri}'` : 'null'}`,
    )
    .join('')}`
      : ''
  }${
    options.supportedTrust && options.supportedTrust.length > 0
      ? `
  supportedTrust:${options.supportedTrust.map((trust) => `\n    - '${trust}'`).join('')}`
      : ''
  }`;

    const agentMd = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Test Agent'
  description: 'Test agent for ERC-8004 integration'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
  defaultInputModes: ['text/plain']
  defaultOutputModes: ['text/plain']
${erc8004Block}
---

Test agent prompt.
`;

    writeFileSync(join(tempDir, 'agent.md'), agentMd);

    // Create minimal manifest
    const manifest = {
      version: 1,
      skills: [],
      registries: {
        mcp: './mcp.json',
        workflows: './workflow.json',
      },
      merge: {},
    };
    writeFileSync(join(tempDir, 'agent.manifest.json'), JSON.stringify(manifest, null, 2));

    // Create minimal MCP registry file
    const mcpRegistry = {
      mcpServers: {},
    };
    writeFileSync(join(tempDir, 'mcp.json'), JSON.stringify(mcpRegistry, null, 2));

    // Create minimal workflow registry file
    const workflowRegistry = {
      workflows: [],
    };
    writeFileSync(join(tempDir, 'workflow.json'), JSON.stringify(workflowRegistry, null, 2));

    return tempDir;
  }

  describe('ERC-8004 extension presence', () => {
    it('should not include ERC-8004 extension when not configured', async () => {
      // Given: agent config without ERC-8004
      const configDir = createConfigWithErc8004({ enabled: false });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: Agent Card should not have ERC-8004 extension
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeUndefined();
    });

    it('should include ERC-8004 extension when enabled', async () => {
      // Given: agent config with ERC-8004 enabled
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: Agent Card should have ERC-8004 extension
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeDefined();
      expect(erc8004Ext?.uri).toBe('https://eips.ethereum.org/EIPS/eip-8004');
      expect(erc8004Ext?.description).toBe('ERC-8004 discovery/trust');
      expect(erc8004Ext?.required).toBe(false);
    });
  });

  describe('canonicalCaip10 param', () => {
    it('should include canonicalCaip10 when operator address is present', async () => {
      // Given: ERC-8004 config with canonical chain and operator address
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should include canonicalCaip10 param in CAIP-10 format
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('canonicalCaip10');
      expect((erc8004Ext?.params as { canonicalCaip10: string })?.canonicalCaip10).toBe(
        'eip155:42161:0xabcdef1234567890abcdef1234567890abcdef12',
      );
    });

    it('should not include canonicalCaip10 when operator address is missing', async () => {
      // Given: ERC-8004 config without operator address
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should not include canonicalCaip10 param
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should compute canonicalCaip10 for Ethereum mainnet', async () => {
      // Given: ERC-8004 config with Ethereum mainnet as canonical
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 1, operatorAddress: '0x1111111111111111111111111111111111111111' },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: canonicalCaip10 should use chain ID 1
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect((erc8004Ext?.params as { canonicalCaip10: string })?.canonicalCaip10).toBe(
        'eip155:1:0x1111111111111111111111111111111111111111',
      );
    });
  });

  describe('identityRegistry param', () => {
    it('should include identityRegistry when configured for canonical chain', async () => {
      // Given: ERC-8004 config with identity registry for canonical chain
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
        identityRegistries: {
          '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should include identityRegistry in CAIP-2 format
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('identityRegistry');
      expect((erc8004Ext?.params as { identityRegistry: string })?.identityRegistry).toBe(
        'eip155:42161:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      );
    });

    it('should not include identityRegistry when not configured for canonical chain', async () => {
      // Given: ERC-8004 config with registry for different chain
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
        identityRegistries: {
          '1': '0x1111111111111111111111111111111111111111',
          '8453': '0x2222222222222222222222222222222222222222',
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should not include identityRegistry param
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should use Sepolia identity registry address', async () => {
      // Given: ERC-8004 config with Sepolia registry
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 11155111 },
        identityRegistries: {
          '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847',
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: identityRegistry should include Sepolia chain ID and address
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect((erc8004Ext?.params as { identityRegistry: string })?.identityRegistry).toBe(
        'eip155:11155111:0x8004a6090cd10a7288092483047b097295fb8847',
      );
    });
  });

  describe('registrationUri param', () => {
    it('should include registrationUri when available for canonical chain', async () => {
      // Given: ERC-8004 config with registration data
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
        registrations: {
          '42161': {
            agentId: 123,
            registrationUri: 'ipfs://QmTest123456789',
          },
        },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should include registrationUri
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('registrationUri');
      expect((erc8004Ext?.params as { registrationUri: string })?.registrationUri).toBe(
        'ipfs://QmTest123456789',
      );
    });

    it('should not include registrationUri when not available', async () => {
      // Given: ERC-8004 config without registration data
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should not include registrationUri
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });
  });

  describe('supportedTrust param', () => {
    it('should include supportedTrust when configured', async () => {
      // Given: ERC-8004 config with supportedTrust array
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
        supportedTrust: ['dns', 'ens', 'lens'],
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should include supportedTrust
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('supportedTrust');
      expect((erc8004Ext?.params as { supportedTrust: string[] })?.supportedTrust).toEqual([
        'dns',
        'ens',
        'lens',
      ]);
    });

    it('should not include supportedTrust when empty', async () => {
      // Given: ERC-8004 config with empty supportedTrust
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: { chainId: 42161 },
        supportedTrust: [],
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should not include supportedTrust
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });
  });

  describe('complete ERC-8004 configuration', () => {
    it('should include all params when fully configured', async () => {
      // Given: complete ERC-8004 configuration
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1 }, { chainId: 8453 }],
        identityRegistries: {
          '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
        registrations: {
          '42161': {
            agentId: 456,
            registrationUri: 'ipfs://QmFullConfig',
          },
        },
        supportedTrust: ['dns', 'ens'],
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: extension should include all params
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeDefined();
      expect(erc8004Ext?.uri).toBe('https://eips.ethereum.org/EIPS/eip-8004');
      expect(erc8004Ext?.description).toBe('ERC-8004 discovery/trust');
      expect(erc8004Ext?.required).toBe(false);
      expect(erc8004Ext?.params).toHaveProperty('canonicalCaip10');
      expect(erc8004Ext?.params).toHaveProperty('identityRegistry');
      expect(erc8004Ext?.params).toHaveProperty('registrationUri');
      expect(erc8004Ext?.params).toHaveProperty('supportedTrust');

      // Verify param values
      const params = erc8004Ext?.params as Record<string, unknown>;
      expect(params['canonicalCaip10']).toBe(
        'eip155:42161:0x1234567890123456789012345678901234567890',
      );
      expect(params['identityRegistry']).toBe(
        'eip155:42161:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      );
      expect(params['registrationUri']).toBe('ipfs://QmFullConfig');
      expect(params['supportedTrust']).toEqual(['dns', 'ens']);
    });

    it('should compose valid Agent Card that passes validation', async () => {
      // Given: fully configured ERC-8004 setup
      const configDir = createConfigWithErc8004({
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1 }],
        identityRegistries: {
          '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
        supportedTrust: ['dns'],
      });
      const manifestPath = join(configDir, 'agent.manifest.json');

      // When: loading agent config
      const config = await loadAgentConfig(manifestPath);

      // Then: Agent Card should be valid and contain expected structure
      expect(config.card).toBeDefined();
      expect(config.card.name).toBe('Test Agent');
      expect(config.card.capabilities).toBeDefined();
      expect(config.card.capabilities?.extensions).toBeDefined();
      expect(config.card.capabilities?.extensions?.length).toBeGreaterThan(0);

      // Extension should be properly formatted
      const erc8004Ext = config.card.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeDefined();
      expect(typeof erc8004Ext?.uri).toBe('string');
      expect(typeof erc8004Ext?.description).toBe('string');
      expect(typeof erc8004Ext?.required).toBe('boolean');
      expect(typeof erc8004Ext?.params).toBe('object');
    });
  });
});
