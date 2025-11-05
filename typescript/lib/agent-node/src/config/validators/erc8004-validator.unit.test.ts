/**
 * Unit tests for ERC-8004 configuration validator
 * Tests validation rules for ERC-8004 agent registration configuration
 */

import { describe, it, expect } from 'vitest';

import type { ERC8004Config } from '../schemas/agent.schema.js';

import { validateERC8004Config } from './erc8004-validator.js';

describe('ERC-8004 Configuration Validator', () => {
  describe('when ERC-8004 is not configured', () => {
    it('should return no errors or warnings when config is undefined', () => {
      // Given: undefined ERC-8004 config
      const config = undefined;
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return no errors or warnings when enabled is false', () => {
      // Given: ERC-8004 config with enabled=false
      const config: ERC8004Config = {
        enabled: false,
        canonical: undefined,
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('when ERC-8004 is enabled', () => {
    it('should error when enabled but canonical chain not configured', () => {
      // Given: enabled ERC-8004 without canonical chain
      const config: ERC8004Config = {
        enabled: true,
        canonical: undefined,
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should return error about missing canonical
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('ERC-8004 enabled but canonical chain not configured');
      expect(result.errors[0]).toContain('Add `erc8004.canonical`');
    });

    it('should error when canonical chainId is invalid (zero)', () => {
      // Given: canonical with chainId = 0
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 0 },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid chainId
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid canonical chainId: 0');
      expect(result.errors[0]).toContain('Must be a positive integer');
    });

    it('should error when canonical chainId is negative', () => {
      // Given: canonical with negative chainId
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: -1 },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid chainId
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid canonical chainId: -1');
    });

    it('should error when canonical chainId is not an integer', () => {
      // Given: canonical with float chainId
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 1.5 },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid chainId
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid canonical chainId: 1.5');
    });

    it('should warn when operator address is missing', () => {
      // Given: canonical without operator address
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 42161 },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should warn about missing operator address
      expect(result.errors).toEqual([]);
      // We may get 2 warnings: one for missing operator, one for no mirrors
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      const operatorWarning = result.warnings.find((w) => w.includes('Canonical operator address'));
      expect(operatorWarning).toBeDefined();
      expect(operatorWarning).toContain('Canonical operator address not configured');
      expect(operatorWarning).toContain('CAIP-10 reference cannot be formed');
      expect(operatorWarning).toContain('Add `erc8004.canonical.operatorAddress`');
    });

    it('should warn when card URL is local and NODE_ENV is production', () => {
      // Given: local card URL and production environment
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';
      const nodeEnv = 'production';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl, nodeEnv);

      // Then: should warn about local URL in production
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('appears to be a local/development URL'),
      );
      expect(result.warnings).toContainEqual(expect.stringContaining('NODE_ENV=production'));
    });

    it('should not warn about local URL when NODE_ENV is development', () => {
      // Given: local card URL and development environment
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';
      const nodeEnv = 'development';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl, nodeEnv);

      // Then: should not warn about local URL
      expect(result.errors).toEqual([]);
      const localUrlWarnings = result.warnings.filter((w) =>
        w.includes('appears to be a local/development URL'),
      );
      expect(localUrlWarnings).toHaveLength(0);
    });

    it('should detect localhost variants as local URLs', () => {
      // Given: various localhost variants
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 1, operatorAddress: '0x1234567890123456789012345678901234567890' },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const nodeEnv = 'production';

      const localUrls = [
        'http://localhost:3000/a2a',
        'http://127.0.0.1:3000/a2a',
        'http://0.0.0.0:3000/a2a',
        'http://myapp.local/a2a',
      ];

      // When/Then: all should warn in production
      for (const url of localUrls) {
        const result = validateERC8004Config(config, url, nodeEnv);
        expect(result.warnings).toContainEqual(
          expect.stringContaining('appears to be a local/development URL'),
        );
      }
    });

    it('should not warn for public URLs in production', () => {
      // Given: public card URL and production environment
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';
      const nodeEnv = 'production';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl, nodeEnv);

      // Then: should not warn about URL
      expect(result.errors).toEqual([]);
      const localUrlWarnings = result.warnings.filter((w) =>
        w.includes('appears to be a local/development URL'),
      );
      expect(localUrlWarnings).toHaveLength(0);
    });
  });

  describe('identity registries validation', () => {
    it('should warn when identity registries use zero-address placeholders', () => {
      // Given: identity registries with zero addresses
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {
          '1': '0x0000000000000000000000000000000000000000',
          '42161': '0x0000000000000000000000000000000000000000',
          '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847', // Sepolia has real address
        },
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should warn about zero-address registries
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Identity registries use zero-address placeholders'),
      );
      expect(result.warnings).toContainEqual(expect.stringContaining('chains: 1, 42161'));
      expect(result.warnings).toContainEqual(expect.stringContaining('undeployed contracts'));
    });

    it('should not warn when all identity registries have real addresses', () => {
      // Given: identity registries with real addresses (no zero-address)
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {
          '1': '0x1111111111111111111111111111111111111111',
          '42161': '0x2222222222222222222222222222222222222222',
          '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847',
        },
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should not warn about zero addresses
      expect(result.errors).toEqual([]);
      const zeroAddressWarnings = result.warnings.filter((w) =>
        w.includes('zero-address placeholders'),
      );
      expect(zeroAddressWarnings).toHaveLength(0);
    });

    it('should handle mixed-case zero-address check', () => {
      // Given: zero address in mixed case
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 1, operatorAddress: '0x1234567890123456789012345678901234567890' },
        mirrors: [],
        identityRegistries: {
          '1': '0x0000000000000000000000000000000000000000', // lowercase
          '8453': '0x0000000000000000000000000000000000000000'.toUpperCase(), // uppercase
        },
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should detect both as zero-address regardless of case
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Identity registries use zero-address placeholders'),
      );
      expect(result.warnings).toContainEqual(expect.stringContaining('chains: 1, 8453'));
    });
  });

  describe('mirror chains validation', () => {
    it('should warn when no mirror chains are configured', () => {
      // Given: no mirrors configured
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should warn about missing mirrors
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('No mirror chains configured'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Consider adding `erc8004.mirrors`'),
      );
    });

    it('should not warn when mirrors are configured', () => {
      // Given: mirrors configured
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1 }, { chainId: 8453 }],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should not warn about missing mirrors
      expect(result.errors).toEqual([]);
      const mirrorWarnings = result.warnings.filter((w) =>
        w.includes('No mirror chains configured'),
      );
      expect(mirrorWarnings).toHaveLength(0);
    });

    it('should error when mirror chainId is invalid (zero)', () => {
      // Given: mirror with chainId = 0
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 0 }],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid mirror chainId
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid mirror chainId at index 0: 0');
      expect(result.errors[0]).toContain('Must be a positive integer');
    });

    it('should error when mirror chainId is negative', () => {
      // Given: mirror with negative chainId
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1 }, { chainId: -5 }],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid mirror chainId at correct index
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid mirror chainId at index 1: -5');
    });

    it('should error when mirror chainId is not an integer', () => {
      // Given: mirror with float chainId
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1.5 }],
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error about invalid mirror chainId
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid mirror chainId at index 0: 1.5');
    });

    it('should error for multiple invalid mirror chainIds', () => {
      // Given: multiple mirrors with invalid chainIds
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 0 }, { chainId: -1 }, { chainId: 8453 }], // Two invalid, one valid
        identityRegistries: {},
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl);

      // Then: should error for both invalid chainIds
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Invalid mirror chainId at index 0: 0');
      expect(result.errors[1]).toContain('Invalid mirror chainId at index 1: -1');
    });
  });

  describe('comprehensive validation scenarios', () => {
    it('should accumulate multiple warnings', () => {
      // Given: config with multiple warning conditions
      const config: ERC8004Config = {
        enabled: true,
        canonical: { chainId: 42161 }, // Missing operator address
        mirrors: [], // No mirrors
        identityRegistries: {
          '42161': '0x0000000000000000000000000000000000000000', // Zero address
        },
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'http://localhost:3000/a2a';
      const nodeEnv = 'production';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl, nodeEnv);

      // Then: should return multiple warnings, no errors
      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Canonical operator address not configured'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('No mirror chains configured'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Identity registries use zero-address placeholders'),
      );
    });

    it('should return valid config with all requirements met', () => {
      // Given: fully valid ERC-8004 config
      const config: ERC8004Config = {
        enabled: true,
        canonical: {
          chainId: 42161,
          operatorAddress: '0x1234567890123456789012345678901234567890',
        },
        mirrors: [{ chainId: 1 }, { chainId: 8453 }],
        identityRegistries: {
          '1': '0x1111111111111111111111111111111111111111',
          '8453': '0x2222222222222222222222222222222222222222',
          '42161': '0x3333333333333333333333333333333333333333',
        },
        registrations: {},
        supportedTrust: [],
      };
      const cardUrl = 'https://api.example.com/a2a';
      const nodeEnv = 'production';

      // When: validating config
      const result = validateERC8004Config(config, cardUrl, nodeEnv);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });
});
