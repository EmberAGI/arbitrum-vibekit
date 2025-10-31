/**
 * Unit tests for routing configuration validator
 * Tests validation rules for Agent Card hosting configuration
 */

import { describe, it, expect } from 'vitest';

import type { RoutingConfig } from '../schemas/agent.schema.js';

import { validateRoutingConfig } from './routing-validator.js';

describe('Routing Configuration Validator', () => {
  describe('when routing is not configured', () => {
    it('should return no errors or warnings when config is undefined', () => {
      // Given: undefined routing config
      const config = undefined;

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return no errors or warnings for empty config object', () => {
      // Given: empty routing config
      const config: RoutingConfig = {};

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('agentCardPath validation', () => {
    it('should not error or warn for default Agent Card path', () => {
      // Given: default Agent Card path
      const config: RoutingConfig = {
        agentCardPath: '/.well-known/agent-card.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should return no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should error when agentCardPath does not start with "/"', () => {
      // Given: agentCardPath without leading slash
      const config: RoutingConfig = {
        agentCardPath: 'agent-card.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about invalid path format
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardPath: "agent-card.json"');
      expect(result.errors[0]).toContain('Must start with "/"');
      expect(result.errors[0]).toContain('/.well-known/agent-card.json');
    });

    it('should error when agentCardPath is a relative path', () => {
      // Given: relative path
      const config: RoutingConfig = {
        agentCardPath: './well-known/agent-card.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about invalid format
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardPath');
      expect(result.errors[0]).toContain('Must start with "/"');
    });

    it('should error when agentCardPath is not a string', () => {
      // Given: non-string agentCardPath
      const config = {
        agentCardPath: 123,
      } as unknown as RoutingConfig;

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about type
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardPath: must be a string');
    });

    it('should warn when using custom Agent Card path with prefix', () => {
      // Given: custom path with prefix
      const config: RoutingConfig = {
        agentCardPath: '/api/v1/.well-known/agent-card.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about customization
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(
        'Custom Agent Card path configured: "/api/v1/.well-known/agent-card.json"',
      );
      expect(result.warnings[0]).toContain('Default is "/.well-known/agent-card.json"');
      expect(result.warnings[0]).toContain('Ensure your deployment serves the Agent Card at this path');
    });

    it('should warn when using different custom Agent Card path', () => {
      // Given: completely different custom path
      const config: RoutingConfig = {
        agentCardPath: '/custom/agent-info.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about customization
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card path configured: "/custom/agent-info.json"');
    });

    it('should allow root path', () => {
      // Given: root path
      const config: RoutingConfig = {
        agentCardPath: '/agent-card.json',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about custom path but not error
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card path');
    });
  });

  describe('agentCardOrigin validation', () => {
    it('should warn when agentCardOrigin is customized (valid origin)', () => {
      // Given: custom origin override
      const config: RoutingConfig = {
        agentCardOrigin: 'https://api.example.com',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about custom override
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card origin configured: "https://api.example.com"');
      expect(result.warnings[0]).toContain('Default behavior uses the origin from `card.url`');
      expect(result.warnings[0]).toContain('Ensure this override matches your deployment configuration');
    });

    it('should warn for custom origin with port', () => {
      // Given: custom origin with port
      const config: RoutingConfig = {
        agentCardOrigin: 'https://api.example.com:8080',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about custom override (valid origin with port)
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card origin configured: "https://api.example.com:8080"');
    });

    it('should error when agentCardOrigin includes path', () => {
      // Given: origin with path component
      const config: RoutingConfig = {
        agentCardOrigin: 'https://api.example.com/api/v1',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about including path
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardOrigin: "https://api.example.com/api/v1"');
      expect(result.errors[0]).toContain('Must be an origin only (scheme + host + optional port), without path');
      expect(result.errors[0]).toContain('Example: "https://example.com"');
    });

    it('should error when agentCardOrigin includes query string', () => {
      // Given: origin with query string
      const config: RoutingConfig = {
        agentCardOrigin: 'https://api.example.com?param=value',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about including query
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardOrigin');
      expect(result.errors[0]).toContain('without path');
    });

    it('should error when agentCardOrigin includes hash', () => {
      // Given: origin with hash
      const config: RoutingConfig = {
        agentCardOrigin: 'https://api.example.com#section',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about including hash
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardOrigin');
      expect(result.errors[0]).toContain('without path');
    });

    it('should error when agentCardOrigin is not a valid URL', () => {
      // Given: invalid URL format
      const config: RoutingConfig = {
        agentCardOrigin: 'not-a-valid-url',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about invalid URL
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardOrigin: "not-a-valid-url"');
      expect(result.errors[0]).toContain('Must be a valid URL origin');
    });

    it('should error when agentCardOrigin is not a string', () => {
      // Given: non-string agentCardOrigin
      const config = {
        agentCardOrigin: 12345,
      } as unknown as RoutingConfig;

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should error about type
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid agentCardOrigin: must be a string');
    });

    it('should accept http origin (non-https)', () => {
      // Given: http origin (valid for development)
      const config: RoutingConfig = {
        agentCardOrigin: 'http://localhost:3000',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn about custom override but not error
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card origin configured: "http://localhost:3000"');
    });
  });

  describe('combined validation scenarios', () => {
    it('should accumulate errors and warnings from both fields', () => {
      // Given: invalid agentCardPath and invalid agentCardOrigin
      const config: RoutingConfig = {
        agentCardPath: 'invalid-path',
        agentCardOrigin: 'https://api.example.com/with/path',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should return errors for both fields
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Invalid agentCardPath: "invalid-path"');
      expect(result.errors[1]).toContain('Invalid agentCardOrigin: "https://api.example.com/with/path"');
    });

    it('should warn for custom path and custom origin together', () => {
      // Given: both custom path and custom origin
      const config: RoutingConfig = {
        agentCardPath: '/api/v1/agent-card.json',
        agentCardOrigin: 'https://cdn.example.com',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should warn for both customizations
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toContain('Custom Agent Card path configured');
      expect(result.warnings[1]).toContain('Custom Agent Card origin configured');
    });

    it('should return valid config when both fields use valid custom values', () => {
      // Given: valid custom path and valid custom origin
      const config: RoutingConfig = {
        agentCardPath: '/custom/path/agent-card.json',
        agentCardOrigin: 'https://cdn.example.com',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should only have warnings (no errors)
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(2);
    });

    it('should validate successfully with default path and custom origin', () => {
      // Given: default path with custom origin
      const config: RoutingConfig = {
        agentCardPath: '/.well-known/agent-card.json',
        agentCardOrigin: 'https://cdn.example.com',
      };

      // When: validating config
      const result = validateRoutingConfig(config);

      // Then: should only warn about custom origin
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Custom Agent Card origin configured');
    });
  });
});
