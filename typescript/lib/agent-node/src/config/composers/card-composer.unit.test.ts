/**
 * Unit tests for card-composer
 * Tests A2A card composition with merge policies (union, intersect, tightest)
 */

import type { AgentCard } from '@a2a-js/sdk';
import { describe, it, expect, vi } from 'vitest';

import type { LoadedAgentBase } from '../loaders/agent-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';
import type { MergePolicy } from '../schemas/manifest.schema.js';

import { composeAgentCard } from './card-composer.js';

// Mock the validator
vi.mock('../validators/a2a-validator.js', () => ({
  validateAgentCard: (card: AgentCard) => card,
}));

// Helper to create minimal test skill
function createMinimalSkill(
  id: string,
  overrides: Partial<LoadedSkill['frontmatter']['skill']> = {},
): LoadedSkill {
  return {
    body: `Skill ${id} prompt`,
    path: `/test/${id}.md`,
    frontmatter: {
      skill: {
        id,
        name: `Skill ${id}`,
        description: `Description for ${id}`,
        tags: [],
        examples: [],
        inputModes: [],
        outputModes: [],
        ...overrides,
      },
    },
  };
}

describe('composeAgentCard', () => {
  const baseAgent: LoadedAgentBase = {
    body: 'Base prompt',
    path: '/test/agent.md',
    frontmatter: {
      version: 1,
      card: {
        protocolVersion: '0.3.0',
        name: 'Test Agent',
        description: 'A test agent',
        url: 'http://localhost:3000/a2a',
        version: '1.0.0',
        capabilities: {},
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        skills: [],
      },
    },
  };

  describe('basic composition', () => {
    it('should compose card from base when no skills provided', () => {
      // Given an agent base with no skills
      const mergePolicy: MergePolicy = {};

      // When composing the agent card
      const result = composeAgentCard(baseAgent, [], mergePolicy);

      // Then the result should match the base card
      expect(result.name).toBe('Test Agent');
      expect(result.description).toBe('A test agent');
      expect(result.url).toBe('http://localhost:3000/a2a');
      expect(result.skills).toEqual([]);
    });

    it('should include skill references in composed card', () => {
      // Given multiple skills
      const skills = [
        createMinimalSkill('swap-skill', {
          name: 'Token Swap',
          tags: ['defi'],
          examples: ['Swap 1 ETH'],
        }),
        createMinimalSkill('bridge-skill', {
          name: 'Bridge',
          tags: ['cross-chain'],
        }),
      ];
      const mergePolicy: MergePolicy = {};

      // When composing the card
      const result = composeAgentCard(baseAgent, skills, mergePolicy);

      // Then skill references should be included
      expect(result.skills).toHaveLength(2);
      expect(result.skills?.[0]?.id).toBe('swap-skill');
      expect(result.skills?.[0]?.name).toBe('Token Swap');
      expect(result.skills?.[1]?.id).toBe('bridge-skill');
    });
  });

  describe('capabilities merging with union strategy', () => {
    it('should merge streaming capability with union (true OR false = true)', () => {
      // Given base without streaming and skill with streaming
      const skills = [
        createMinimalSkill('streaming-skill', {
          capabilities: { streaming: true },
        }),
      ];
      const mergePolicy: MergePolicy = {
        card: { capabilities: 'union', toolPolicies: 'intersect', guardrails: 'tightest' },
      };

      // When composing with union strategy
      const result = composeAgentCard(baseAgent, skills, mergePolicy);

      // Then streaming should be true (union)
      expect(result.capabilities?.streaming).toBe(true);
    });
  });

  describe('capabilities merging with intersect strategy', () => {
    it('should merge streaming capability with intersect (true AND false = false)', () => {
      // Given base with streaming=true
      const agentWithStreaming: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          card: {
            ...baseAgent.frontmatter.card,
            capabilities: { streaming: true },
          },
        },
      };

      // And skill without streaming (undefined treated as false)
      const skills = [createMinimalSkill('no-streaming-skill')];
      const mergePolicy: MergePolicy = {
        card: { capabilities: 'intersect', toolPolicies: 'intersect', guardrails: 'tightest' },
      };

      // When composing with intersect strategy
      const result = composeAgentCard(agentWithStreaming, skills, mergePolicy);

      // Then streaming should be true (only base has it, undefined doesn't override in intersect)
      expect(result.capabilities?.streaming).toBe(true);
    });
  });

  describe('tool policies merging', () => {
    it('should merge tool policies with intersect strategy (default)', () => {
      // Given base with tool policies
      const agentWithPolicies: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          card: {
            ...baseAgent.frontmatter.card,
            toolPolicies: ['policy1', 'policy2', 'policy3'],
          },
        },
      };

      // And skill with overlapping policies
      const skills = [
        createMinimalSkill('policy-skill', {
          toolPolicies: ['policy2', 'policy3', 'policy4'],
        }),
      ];
      const mergePolicy: MergePolicy = {
        card: { capabilities: 'union', toolPolicies: 'intersect', guardrails: 'tightest' },
      };

      // When composing with intersect strategy
      const result = composeAgentCard(agentWithPolicies, skills, mergePolicy);

      // Then only common policies should remain in extension
      const extension = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'urn:agent:tool-policies',
      );
      expect(extension?.params).toHaveProperty('policies');
      const policies = (extension?.params as { policies: string[] })?.policies ?? [];
      expect(policies).toContain('policy2');
      expect(policies).toContain('policy3');
      expect(policies).not.toContain('policy1');
      expect(policies).not.toContain('policy4');
    });
  });

  describe('input/output modes merging', () => {
    it('should combine input and output modes from all skills', () => {
      // Given skills with different modes
      const skills = [
        createMinimalSkill('voice-skill', {
          inputModes: ['voice'],
          outputModes: ['audio'],
        }),
        createMinimalSkill('image-skill', {
          inputModes: ['image'],
          outputModes: ['image'],
        }),
      ];
      const mergePolicy: MergePolicy = {};

      // When composing the card
      const result = composeAgentCard(baseAgent, skills, mergePolicy);

      // Then all modes should be combined
      expect(result.defaultInputModes).toContain('text'); // from base
      expect(result.defaultInputModes).toContain('voice');
      expect(result.defaultInputModes).toContain('image');
      expect(result.defaultOutputModes).toContain('text'); // from base
      expect(result.defaultOutputModes).toContain('audio');
      expect(result.defaultOutputModes).toContain('image');
    });
  });

  describe('ERC-8004 extension composition', () => {
    it('should not include ERC-8004 extension when not configured', () => {
      // Given: agent base without erc8004 config
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(baseAgent, [], mergePolicy);

      // Then: no ERC-8004 extension should be present
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeUndefined();
    });

    it('should not include ERC-8004 extension when enabled is false', () => {
      // Given: agent base with erc8004.enabled=false
      const agentWithErc8004Disabled: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: false,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004Disabled, [], mergePolicy);

      // Then: no ERC-8004 extension should be present
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeUndefined();
    });

    it('should include ERC-8004 extension when enabled', () => {
      // Given: agent base with erc8004.enabled=true
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: {
              chainId: 42161,
              operatorAddress: '0x1234567890123456789012345678901234567890',
            },
            mirrors: [{ chainId: 1 }, { chainId: 8453 }],
            identityRegistries: {
              '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: ERC-8004 extension should be present
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext).toBeDefined();
      expect(erc8004Ext?.uri).toBe('https://eips.ethereum.org/EIPS/eip-8004');
      expect(erc8004Ext?.description).toBe('ERC-8004 discovery/trust');
      expect(erc8004Ext?.required).toBe(false);
    });

    it('should include canonicalCaip10 in extension params when operator address is present', () => {
      // Given: agent with canonical chain and operator address
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: {
              chainId: 42161,
              operatorAddress: '0x1234567890123456789012345678901234567890',
            },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should include canonicalCaip10 param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('canonicalCaip10');
      expect((erc8004Ext?.params as { canonicalCaip10: string })?.canonicalCaip10).toBe(
        'eip155:42161:0x1234567890123456789012345678901234567890',
      );
    });

    it('should not include canonicalCaip10 when operator address is missing', () => {
      // Given: agent with canonical chain but no operator address
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should not include canonicalCaip10 param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should include identityRegistry in extension params when available', () => {
      // Given: agent with identity registry for canonical chain
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {
              '42161': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should include identityRegistry CAIP-2 param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('identityRegistry');
      expect((erc8004Ext?.params as { identityRegistry: string })?.identityRegistry).toBe(
        'eip155:42161:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      );
    });

    it('should not include identityRegistry when not configured for canonical chain', () => {
      // Given: agent with identity registries but not for canonical chain
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {
              '1': '0x1111111111111111111111111111111111111111',
              '8453': '0x2222222222222222222222222222222222222222',
            },
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should not include identityRegistry param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should include registrationUri when available for canonical chain', () => {
      // Given: agent with registration data for canonical chain
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {
              '42161': {
                agentId: 123,
                registrationUri: 'ipfs://QmTest123456789',
              },
            },
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should include registrationUri param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('registrationUri');
      expect((erc8004Ext?.params as { registrationUri: string })?.registrationUri).toBe(
        'ipfs://QmTest123456789',
      );
    });

    it('should not include registrationUri when not available', () => {
      // Given: agent without registration data
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should not include registrationUri param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should include supportedTrust when configured', () => {
      // Given: agent with supportedTrust array
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: ['dns', 'ens', 'lens'],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should include supportedTrust param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toHaveProperty('supportedTrust');
      expect((erc8004Ext?.params as { supportedTrust: string[] })?.supportedTrust).toEqual([
        'dns',
        'ens',
        'lens',
      ]);
    });

    it('should not include supportedTrust when empty', () => {
      // Given: agent with empty supportedTrust array
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
            enabled: true,
            canonical: { chainId: 42161 },
            mirrors: [],
            identityRegistries: {},
            registrations: {},
            supportedTrust: [],
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should not include supportedTrust param
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      // When no params are set, the params field is omitted entirely
      expect(erc8004Ext?.params).toBeUndefined();
    });

    it('should include all params when fully configured', () => {
      // Given: agent with complete ERC-8004 configuration
      const agentWithErc8004: LoadedAgentBase = {
        ...baseAgent,
        frontmatter: {
          ...baseAgent.frontmatter,
          erc8004: {
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
          },
        },
      };
      const mergePolicy: MergePolicy = {};

      // When: composing the agent card
      const result = composeAgentCard(agentWithErc8004, [], mergePolicy);

      // Then: extension should include all params
      const erc8004Ext = result.capabilities?.extensions?.find(
        (ext) => ext.uri === 'https://eips.ethereum.org/EIPS/eip-8004',
      );
      expect(erc8004Ext?.params).toBeDefined();
      expect(erc8004Ext?.params).toHaveProperty('canonicalCaip10');
      expect(erc8004Ext?.params).toHaveProperty('identityRegistry');
      expect(erc8004Ext?.params).toHaveProperty('registrationUri');
      expect(erc8004Ext?.params).toHaveProperty('supportedTrust');
    });
  });
});
