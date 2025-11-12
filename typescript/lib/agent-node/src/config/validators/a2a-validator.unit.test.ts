/**
 * Unit tests for a2a-validator
 * Tests A2A v0.3.0 agent card validation
 */

import type { AgentCard } from '@a2a-js/sdk';
import { describe, it, expect } from 'vitest';

import { validateAgentCard } from './a2a-validator.js';

describe('validateAgentCard', () => {
  const minimalValidCard: AgentCard = {
    protocolVersion: '0.3.0',
    name: 'Test Agent',
    description: 'A test agent',
    url: 'http://localhost:3000/a2a',
    version: '1.0.0',
    capabilities: {},
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [],
  };

  describe('valid cards', () => {
    it('should validate minimal valid agent card', () => {
      // Given a minimal valid agent card
      const card = minimalValidCard;

      // When validating
      const result = validateAgentCard(card);

      // Then should return the validated card
      expect(result).toBeDefined();
      expect(result.name).toBe('Test Agent');
    });

    it('should validate card with capabilities', () => {
      // Given a card with capabilities
      const card: AgentCard = {
        ...minimalValidCard,
        capabilities: {
          streaming: true,
          pushNotifications: false,
        },
      };

      // When validating
      const result = validateAgentCard(card);

      // Then should pass validation
      expect(result.capabilities?.streaming).toBe(true);
      expect(result.capabilities?.pushNotifications).toBe(false);
    });

    it('should validate card with extensions', () => {
      // Given a card with extensions
      const card: AgentCard = {
        ...minimalValidCard,
        capabilities: {
          extensions: [
            {
              uri: 'urn:agent:tool-policies',
              params: { policies: ['policy1', 'policy2'] },
            },
          ],
        },
      };

      // When validating
      const result = validateAgentCard(card);

      // Then should pass validation
      expect(result.capabilities?.extensions).toHaveLength(1);
      expect(result.capabilities?.extensions?.[0]?.uri).toBe('urn:agent:tool-policies');
    });

    it('should validate card with skills', () => {
      // Given a card with skills
      const card: AgentCard = {
        ...minimalValidCard,
        skills: [
          {
            id: 'skill-1',
            name: 'Skill 1',
            description: 'Test skill',
            tags: ['test'],
          },
        ],
      };

      // When validating
      const result = validateAgentCard(card);

      // Then should pass validation
      expect(result.skills).toHaveLength(1);
      expect(result.skills?.[0]?.id).toBe('skill-1');
    });

    it('should validate card with provider', () => {
      // Given a card with provider info
      const card: AgentCard = {
        ...minimalValidCard,
        provider: {
          organization: 'Test Org',
          url: 'https://example.com',
        },
      };

      // When validating
      const result = validateAgentCard(card);

      // Then should pass validation
      expect(result.provider?.organization).toBe('Test Org');
      expect(result.provider?.url).toBe('https://example.com');
    });
  });

  describe('invalid cards', () => {
    it('should throw error for missing required fields', () => {
      // Given a card missing required field (name)
      const card = {
        protocolVersion: '0.3.0',
        description: 'A test agent',
        url: 'http://localhost:3000/a2a',
        version: '1.0.0',
        capabilities: {},
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        skills: [],
      } as unknown as AgentCard;

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
    });

    it('should throw error for invalid URL format', () => {
      // Given a card with invalid URL
      const card: AgentCard = {
        ...minimalValidCard,
        url: 'not-a-valid-url',
      };

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
      expect(() => validateAgentCard(card)).toThrow(/url/);
    });

    it('should throw error for empty name', () => {
      // Given a card with empty name
      const card: AgentCard = {
        ...minimalValidCard,
        name: '',
      };

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
    });

    it('should throw error for empty description', () => {
      // Given a card with empty description
      const card: AgentCard = {
        ...minimalValidCard,
        description: '',
      };

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
    });

    it('should throw error for invalid provider URL', () => {
      // Given a card with invalid provider URL
      const card: AgentCard = {
        ...minimalValidCard,
        provider: {
          organization: 'Test Org',
          url: 'invalid-url',
        },
      };

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
    });

    it('should throw error for skill missing required fields', () => {
      // Given a card with incomplete skill
      const card: AgentCard = {
        ...minimalValidCard,
        skills: [
          {
            id: 'skill-1',
            name: '', // Empty name
            description: 'Test',
            tags: [],
          },
        ],
      };

      // When validating
      // Then should throw error
      expect(() => validateAgentCard(card)).toThrow(/validation failed/);
    });
  });

  describe('error messages', () => {
    it('should provide helpful error messages with field paths', () => {
      // Given a card with multiple invalid fields
      const card = {
        protocolVersion: '0.3.0',
        name: '', // Empty
        description: '', // Empty
        url: 'invalid', // Invalid URL
        version: '1.0.0',
        capabilities: {},
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        skills: [],
      } as AgentCard;

      // When validating
      try {
        validateAgentCard(card);
        expect.fail('Should have thrown');
      } catch (error) {
        // Then error should mention field paths
        const message = (error as Error).message;
        expect(message).toContain('validation failed');
        expect(message).toContain('name');
        expect(message).toContain('description');
        expect(message).toContain('url');
      }
    });
  });
});
