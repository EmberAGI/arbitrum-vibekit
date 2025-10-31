/**
 * Unit tests for registration utilities
 * Tests registration file building and chain ID validation
 */

import { describe, it, expect } from 'vitest';

import {
  buildRegistrationFile,
  buildRegistrationFileForRegister,
  isSupportedChain,
  CHAIN_IDS,
  CONTRACT_ADDRESSES,
} from './registration.js';

describe('Registration Utilities', () => {
  describe('isSupportedChain', () => {
    it('should return true for Ethereum mainnet', () => {
      // Given: Ethereum mainnet chain ID
      const chainId = 1;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should be supported
      expect(result).toBe(true);
    });

    it('should return true for Base', () => {
      // Given: Base chain ID
      const chainId = 8453;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should be supported
      expect(result).toBe(true);
    });

    it('should return true for Ethereum Sepolia', () => {
      // Given: Sepolia chain ID
      const chainId = 11155111;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should be supported
      expect(result).toBe(true);
    });

    it('should return true for Arbitrum One', () => {
      // Given: Arbitrum One chain ID
      const chainId = 42161;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should be supported
      expect(result).toBe(true);
    });

    it('should return false for unsupported chain', () => {
      // Given: unsupported chain ID (e.g., Polygon)
      const chainId = 137;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should not be supported
      expect(result).toBe(false);
    });

    it('should return false for invalid chain ID', () => {
      // Given: invalid chain ID
      const chainId = 0;

      // When: checking if supported
      const result = isSupportedChain(chainId);

      // Then: should not be supported
      expect(result).toBe(false);
    });
  });

  describe('CHAIN_IDS constants', () => {
    it('should have correct chain ID constants', () => {
      // Given/When: CHAIN_IDS constant
      // Then: should have all expected chain IDs
      expect(CHAIN_IDS.ETHEREUM).toBe(1);
      expect(CHAIN_IDS.BASE).toBe(8453);
      expect(CHAIN_IDS.ETHEREUM_SEPOLIA).toBe(11155111);
      expect(CHAIN_IDS.ARBITRUM_ONE).toBe(42161);
    });
  });

  describe('CONTRACT_ADDRESSES constants', () => {
    it('should have identity registry for Sepolia', () => {
      // Given: Sepolia chain ID
      const chainId = CHAIN_IDS.ETHEREUM_SEPOLIA;

      // When: getting contract addresses
      const addresses = CONTRACT_ADDRESSES[chainId];

      // Then: should have real identity registry address
      expect(addresses.identity).toBe('0x8004a6090Cd10A7288092483047B097295Fb8847');
      expect(addresses.identity).not.toBe('0x0000000000000000000000000000000000000000');
    });

    it('should have zero-address placeholders for undeployed chains', () => {
      // Given: chains without deployed contracts
      const ethereumAddresses = CONTRACT_ADDRESSES[CHAIN_IDS.ETHEREUM];
      const baseAddresses = CONTRACT_ADDRESSES[CHAIN_IDS.BASE];
      const arbitrumAddresses = CONTRACT_ADDRESSES[CHAIN_IDS.ARBITRUM_ONE];

      // When/Then: should have zero-address placeholders
      expect(ethereumAddresses.identity).toBe('0x0000000000000000000000000000000000000000');
      expect(baseAddresses.identity).toBe('0x0000000000000000000000000000000000000000');
      expect(arbitrumAddresses.identity).toBe('0x0000000000000000000000000000000000000000');
    });
  });

  describe('buildRegistrationFile', () => {
    it('should build registration file with all required fields', () => {
      // Given: agent registration data
      const agentName = 'Test Agent';
      const agentDescription = 'A test agent for unit testing';
      const agentImage = 'https://example.com/agent-image.png';
      const agentVersion = '1.0.0';
      const agentCardUrl = 'https://api.example.com/.well-known/agent-card.json';
      const chainId = 42161;
      const agentId = 123;

      // When: building registration file
      const result = buildRegistrationFile(
        agentName,
        agentDescription,
        agentImage,
        agentVersion,
        agentCardUrl,
        chainId,
        agentId,
      );

      // Then: should have correct structure and values
      expect(result).toEqual({
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: 'Test Agent',
        description: 'A test agent for unit testing',
        image: 'https://example.com/agent-image.png',
        endpoints: [
          {
            name: 'A2A',
            endpoint: 'https://api.example.com/.well-known/agent-card.json',
            version: '1.0.0',
          },
        ],
        registrations: [
          {
            agentId: 123,
            agentRegistry: 'eip155:42161:0x0000000000000000000000000000000000000000',
          },
        ],
        supportedTrust: [],
      });
    });

    it('should use Agent Card URL as endpoint (not A2A URL)', () => {
      // Given: Agent Card URL (well-known path)
      const agentCardUrl = 'https://cdn.example.com/.well-known/agent-card.json';
      const chainId = 1;
      const agentId = 456;

      // When: building registration file
      const result = buildRegistrationFile(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        agentCardUrl,
        chainId,
        agentId,
      );

      // Then: endpoint should be the Agent Card URL
      expect(result.endpoints[0]?.endpoint).toBe('https://cdn.example.com/.well-known/agent-card.json');
    });

    it('should build CAIP-2 agentRegistry reference for Ethereum mainnet', () => {
      // Given: Ethereum mainnet chain ID
      const chainId = 1;
      const agentId = 789;

      // When: building registration file
      const result = buildRegistrationFile(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
        agentId,
      );

      // Then: should have CAIP-2 format with Ethereum mainnet
      expect(result.registrations).toHaveLength(1);
      expect(result.registrations?.[0]?.agentRegistry).toBe(
        'eip155:1:0x0000000000000000000000000000000000000000',
      );
    });

    it('should build CAIP-2 agentRegistry reference for Sepolia with real address', () => {
      // Given: Sepolia chain ID
      const chainId = 11155111;
      const agentId = 999;

      // When: building registration file
      const result = buildRegistrationFile(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
        agentId,
      );

      // Then: should have CAIP-2 format with Sepolia registry address
      expect(result.registrations).toHaveLength(1);
      expect(result.registrations?.[0]?.agentRegistry).toBe(
        'eip155:11155111:0x8004a6090Cd10A7288092483047B097295Fb8847',
      );
    });

    it('should include agentId in registrations array', () => {
      // Given: specific agent ID
      const agentId = 12345;
      const chainId = 42161;

      // When: building registration file
      const result = buildRegistrationFile(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
        agentId,
      );

      // Then: should include the agent ID
      expect(result.registrations?.[0]?.agentId).toBe(12345);
    });

    it('should always have empty supportedTrust array', () => {
      // Given: any agent data
      const chainId = 8453;
      const agentId = 1;

      // When: building registration file
      const result = buildRegistrationFile(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
        agentId,
      );

      // Then: supportedTrust should be empty array
      expect(result.supportedTrust).toEqual([]);
    });
  });

  describe('buildRegistrationFileForRegister', () => {
    it('should build registration file without registrations array', () => {
      // Given: agent registration data for initial registration
      const agentName = 'New Agent';
      const agentDescription = 'A new agent being registered';
      const agentImage = 'https://example.com/new-agent.png';
      const agentVersion = '2.0.0';
      const agentCardUrl = 'https://api.example.com/.well-known/agent-card.json';
      const chainId = 42161;

      // When: building registration file for initial register
      const result = buildRegistrationFileForRegister(
        agentName,
        agentDescription,
        agentImage,
        agentVersion,
        agentCardUrl,
        chainId,
      );

      // Then: should not have registrations array (registry will assign agentId)
      expect(result).toEqual({
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: 'New Agent',
        description: 'A new agent being registered',
        image: 'https://example.com/new-agent.png',
        endpoints: [
          {
            name: 'A2A',
            endpoint: 'https://api.example.com/.well-known/agent-card.json',
            version: '2.0.0',
          },
        ],
        supportedTrust: [],
      });
      expect(result.registrations).toBeUndefined();
    });

    it('should use Agent Card URL as endpoint', () => {
      // Given: Agent Card URL with custom origin
      const agentCardUrl = 'https://cdn.custom.com/api/.well-known/agent-card.json';
      const chainId = 1;

      // When: building registration file for register
      const result = buildRegistrationFileForRegister(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        agentCardUrl,
        chainId,
      );

      // Then: endpoint should be the Agent Card URL
      expect(result.endpoints[0]?.endpoint).toBe('https://cdn.custom.com/api/.well-known/agent-card.json');
    });

    it('should have correct EIP-8004 registration type', () => {
      // Given: any agent data
      const chainId = 8453;

      // When: building registration file for register
      const result = buildRegistrationFileForRegister(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
      );

      // Then: should have correct type
      expect(result.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
    });

    it('should include version in endpoints', () => {
      // Given: specific version
      const agentVersion = '3.2.1';
      const chainId = 42161;

      // When: building registration file for register
      const result = buildRegistrationFileForRegister(
        'Agent',
        'Description',
        'image.png',
        agentVersion,
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
      );

      // Then: version should be included
      expect(result.endpoints[0]?.version).toBe('3.2.1');
    });

    it('should always have empty supportedTrust array', () => {
      // Given: any agent data
      const chainId = 1;

      // When: building registration file for register
      const result = buildRegistrationFileForRegister(
        'Agent',
        'Description',
        'image.png',
        '1.0.0',
        'https://api.example.com/.well-known/agent-card.json',
        chainId,
      );

      // Then: supportedTrust should be empty array
      expect(result.supportedTrust).toEqual([]);
    });

    it('should not be affected by different chain IDs (no registry in output)', () => {
      // Given: different chain IDs
      const chains = [1, 8453, 11155111, 42161];

      for (const chainId of chains) {
        // When: building registration file for each chain
        const result = buildRegistrationFileForRegister(
          'Agent',
          'Description',
          'image.png',
          '1.0.0',
          'https://api.example.com/.well-known/agent-card.json',
          chainId,
        );

        // Then: structure should be same (no registrations array)
        expect(result.registrations).toBeUndefined();
        expect(result.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
      }
    });
  });

  describe('registration file differences', () => {
    it('should show difference between register and update file structures', () => {
      // Given: same agent data
      const agentName = 'Agent';
      const agentDescription = 'Description';
      const agentImage = 'image.png';
      const agentVersion = '1.0.0';
      const agentCardUrl = 'https://api.example.com/.well-known/agent-card.json';
      const chainId = 42161;
      const agentId = 123;

      // When: building both types
      const registerFile = buildRegistrationFileForRegister(
        agentName,
        agentDescription,
        agentImage,
        agentVersion,
        agentCardUrl,
        chainId,
      );
      const updateFile = buildRegistrationFile(
        agentName,
        agentDescription,
        agentImage,
        agentVersion,
        agentCardUrl,
        chainId,
        agentId,
      );

      // Then: register file should omit registrations, update file should include it
      expect(registerFile.registrations).toBeUndefined();
      expect(updateFile.registrations).toBeDefined();
      expect(updateFile.registrations).toHaveLength(1);
      expect(updateFile.registrations?.[0]?.agentId).toBe(123);

      // But other fields should match
      expect(registerFile.type).toBe(updateFile.type);
      expect(registerFile.name).toBe(updateFile.name);
      expect(registerFile.description).toBe(updateFile.description);
      expect(registerFile.image).toBe(updateFile.image);
      expect(registerFile.endpoints).toEqual(updateFile.endpoints);
      expect(registerFile.supportedTrust).toEqual(updateFile.supportedTrust);
    });
  });
});
