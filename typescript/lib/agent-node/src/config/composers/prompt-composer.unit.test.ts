/**
 * Unit tests for prompt-composer
 * Tests prompt merging logic from agent base and skills in manifest order
 */

import { describe, it, expect } from 'vitest';

import type { LoadedAgentBase } from '../loaders/agent-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';

import { composePrompt } from './prompt-composer.js';

describe('composePrompt', () => {
  describe('basic composition', () => {
    it('should compose prompt from agent base only when no skills provided', () => {
      // Given an agent base with no skills
      const agentBase: LoadedAgentBase = {
        body: 'You are a helpful AI assistant.',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then the result should contain only the base content
      expect(result.content).toBe('You are a helpful AI assistant.');
      expect(result.parts.base).toBe('You are a helpful AI assistant.');
      expect(result.parts.skills).toEqual([]);
    });

    it('should compose prompt from agent base and single skill', () => {
      // Given an agent base and one skill
      const agentBase: LoadedAgentBase = {
        body: 'You are a helpful AI assistant.',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: 'You can swap tokens on EVM chains.',
          frontmatter: {
            skill: {
              id: 'swap-skill',
              name: 'Token Swap',
              description: 'Swap tokens',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then the result should merge base and skill with double newline separator
      expect(result.content).toBe(
        'You are a helpful AI assistant.\n\nYou can swap tokens on EVM chains.',
      );
      expect(result.parts.base).toBe('You are a helpful AI assistant.');
      expect(result.parts.skills).toEqual([
        {
          skillId: 'swap-skill',
          content: 'You can swap tokens on EVM chains.',
        },
      ]);
    });

    it('should compose prompt from agent base and multiple skills in manifest order', () => {
      // Given an agent base and multiple skills
      const agentBase: LoadedAgentBase = {
        body: 'You are a helpful AI assistant.',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: 'You can swap tokens.',
          frontmatter: {
            skill: {
              id: 'swap-skill',
              name: 'Token Swap',
              description: 'Swap tokens',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
        {
          body: 'You can bridge assets.',
          frontmatter: {
            skill: {
              id: 'bridge-skill',
              name: 'Asset Bridge',
              description: 'Bridge assets',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
        {
          body: 'You can check balances.',
          frontmatter: {
            skill: {
              id: 'balance-skill',
              name: 'Balance Checker',
              description: 'Check balances',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then the result should include all skills in manifest order with double newline separators
      expect(result.content).toBe(
        'You are a helpful AI assistant.\n\n' +
          'You can swap tokens.\n\n' +
          'You can bridge assets.\n\n' +
          'You can check balances.',
      );
      expect(result.parts.base).toBe('You are a helpful AI assistant.');
      expect(result.parts.skills).toEqual([
        { skillId: 'swap-skill', content: 'You can swap tokens.' },
        { skillId: 'bridge-skill', content: 'You can bridge assets.' },
        { skillId: 'balance-skill', content: 'You can check balances.' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty agent base body', () => {
      // Given an agent base with empty body
      const agentBase: LoadedAgentBase = {
        body: '',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: 'You can swap tokens.',
          frontmatter: {
            skill: {
              id: 'swap-skill',
              name: 'Token Swap',
              description: 'Swap tokens',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then the result should handle empty base gracefully
      expect(result.content).toBe('\n\nYou can swap tokens.');
      expect(result.parts.base).toBe('');
      expect(result.parts.skills).toEqual([
        { skillId: 'swap-skill', content: 'You can swap tokens.' },
      ]);
    });

    it('should handle empty skill body', () => {
      // Given a skill with empty body
      const agentBase: LoadedAgentBase = {
        body: 'You are a helpful AI assistant.',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: '',
          frontmatter: {
            skill: {
              id: 'empty-skill',
              name: 'Empty Skill',
              description: 'Empty',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then the result should handle empty skill body gracefully
      expect(result.content).toBe('You are a helpful AI assistant.\n\n');
      expect(result.parts.base).toBe('You are a helpful AI assistant.');
      expect(result.parts.skills).toEqual([{ skillId: 'empty-skill', content: '' }]);
    });

    it('should preserve whitespace in prompts', () => {
      // Given prompts with significant whitespace
      const agentBase: LoadedAgentBase = {
        body: 'Line 1\n  Indented line\nLine 3',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: '  Leading spaces\nTrailing spaces  ',
          frontmatter: {
            skill: {
              id: 'whitespace-skill',
              name: 'Whitespace',
              description: 'Whitespace test',
            },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then whitespace should be preserved exactly
      expect(result.content).toBe(
        'Line 1\n  Indented line\nLine 3\n\n  Leading spaces\nTrailing spaces  ',
      );
      expect(result.parts.base).toBe('Line 1\n  Indented line\nLine 3');
      expect(result.parts.skills[0]?.content).toBe('  Leading spaces\nTrailing spaces  ');
    });
  });

  describe('skill order preservation', () => {
    it('should preserve exact manifest order even with duplicate content', () => {
      // Given skills with identical bodies but different IDs
      const agentBase: LoadedAgentBase = {
        body: 'Base prompt.',
        frontmatter: {} as LoadedAgentBase['frontmatter'],
        path: '/test/agent.md',
      };
      const skills: LoadedSkill[] = [
        {
          body: 'Skill instruction.',
          frontmatter: {
            skill: { id: 'skill-a', name: 'A', description: 'A' },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
        {
          body: 'Skill instruction.',
          frontmatter: {
            skill: { id: 'skill-b', name: 'B', description: 'B' },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
        {
          body: 'Skill instruction.',
          frontmatter: {
            skill: { id: 'skill-c', name: 'C', description: 'C' },
          } as LoadedSkill['frontmatter'],
          path: '/test/agent.md',
        },
      ];

      // When composing the prompt
      const result = composePrompt(agentBase, skills);

      // Then manifest order should be preserved in parts
      expect(result.parts.skills).toEqual([
        { skillId: 'skill-a', content: 'Skill instruction.' },
        { skillId: 'skill-b', content: 'Skill instruction.' },
        { skillId: 'skill-c', content: 'Skill instruction.' },
      ]);
      expect(result.content).toBe(
        'Base prompt.\n\nSkill instruction.\n\nSkill instruction.\n\nSkill instruction.',
      );
    });
  });
});
