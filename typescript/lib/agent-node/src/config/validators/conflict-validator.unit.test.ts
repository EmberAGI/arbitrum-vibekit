/**
 * Unit tests for conflict-validator
 * Tests configuration well-formedness validation
 *
 * Note: Duplicate ID conflict detection is not needed because all skills select from
 * a single shared registry (mcp.json / workflow.json). The same ID always has the same config.
 */

import { describe, it, expect } from 'vitest';

import type { MCPServerConfig } from '../schemas/mcp.schema.js';
import type { WorkflowEntry } from '../schemas/workflow.schema.js';

import {
  validateMCPServers,
  validateWorkflows,
  validateSkillMCPSelections,
  validateSkillWorkflowSelections,
} from './conflict-validator.js';

describe('validateMCPServers', () => {
  it('should pass when all server configs are well-formed', () => {
    // Given well-formed MCP server configs
    const servers = new Map<string, MCPServerConfig>([
      ['server-1', { command: 'node', args: ['server1.js'] }],
      ['server-2', { command: 'python', args: ['server2.py'] }],
      ['server-3', { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }],
    ]);

    // When validating
    // Then no error should be thrown
    expect(() => validateMCPServers(servers)).not.toThrow();
  });

  it('should pass for HTTP transport servers', () => {
    // Given HTTP transport MCP servers
    const servers = new Map<string, MCPServerConfig>([
      [
        'http-server',
        {
          transport: {
            type: 'http',
            url: 'https://api.example.com/mcp',
          },
        },
      ],
    ]);

    // When validating
    // Then should pass
    expect(() => validateMCPServers(servers)).not.toThrow();
  });

  it('should pass for mixed stdio and HTTP servers', () => {
    // Given mix of stdio and HTTP transport servers
    const servers = new Map<string, MCPServerConfig>([
      ['stdio-server', { command: 'node', args: ['server.js'] }],
      [
        'http-server',
        {
          transport: {
            type: 'http',
            url: 'https://api.example.com/mcp',
          },
        },
      ],
    ]);

    // When validating
    // Then should pass
    expect(() => validateMCPServers(servers)).not.toThrow();
  });
});

describe('validateWorkflows', () => {
  it('should pass for all well-formed workflow entries', () => {
    // Given well-formed workflow entries
    const workflows = new Map<string, WorkflowEntry>([
      ['workflow-1', { id: 'workflow-1', from: './workflows/w1.ts', enabled: true }],
      ['workflow-2', { id: 'workflow-2', from: './workflows/w2.js', enabled: false }],
      ['workflow-3', { id: 'workflow-3', from: './w3.ts' }],
    ]);

    // When validating
    // Then no error should be thrown (validation is minimal)
    expect(() => validateWorkflows(workflows)).not.toThrow();
  });
});

describe('validateSkillMCPSelections', () => {
  it('should pass when all selections reference existing servers', () => {
    // Given skill selections that all exist in registry
    const selections = new Map<string, string[]>([
      ['skill-1', ['server-a', 'server-b']],
      ['skill-2', ['server-b']],
    ]);

    const registryServers = new Set(['server-a', 'server-b', 'server-c']);

    // When validating
    // Then should not throw
    expect(() => validateSkillMCPSelections(selections, registryServers)).not.toThrow();
  });

  it('should throw when skill references non-existent server', () => {
    // Given skill with reference to non-existent server
    const selections = new Map<string, string[]>([['skill-1', ['missing-server']]]);

    const registryServers = new Set(['server-a', 'server-b']);

    // When validating
    // Then should throw with clear error
    expect(() => validateSkillMCPSelections(selections, registryServers)).toThrow(
      /non-existent MCP server/,
    );
    expect(() => validateSkillMCPSelections(selections, registryServers)).toThrow(
      /Available servers/,
    );
  });

  it('should list all missing servers in error message', () => {
    // Given skill with multiple missing servers
    const selections = new Map<string, string[]>([
      ['skill-1', ['missing-1', 'server-a', 'missing-2']],
    ]);

    const registryServers = new Set(['server-a']);

    // When validating
    try {
      validateSkillMCPSelections(selections, registryServers);
      expect.fail('Should have thrown');
    } catch (error) {
      // Then error should list both missing servers
      const errorMessage = (error as Error).message;
      expect(errorMessage).toContain('missing-1');
      expect(errorMessage).toContain('missing-2');
    }
  });
});

describe('validateSkillWorkflowSelections', () => {
  it('should pass when all selections reference existing workflows', () => {
    // Given skill selections that all exist in registry
    const selections = new Map<string, string[]>([
      ['skill-1', ['workflow-a', 'workflow-b']],
      ['skill-2', ['workflow-b']],
    ]);

    const registryWorkflows = new Set(['workflow-a', 'workflow-b', 'workflow-c']);

    // When validating
    // Then should not throw
    expect(() => validateSkillWorkflowSelections(selections, registryWorkflows)).not.toThrow();
  });

  it('should throw when skill references non-existent workflow', () => {
    // Given skill with reference to non-existent workflow
    const selections = new Map<string, string[]>([['skill-1', ['missing-workflow']]]);

    const registryWorkflows = new Set(['workflow-a', 'workflow-b']);

    // When validating
    // Then should throw with clear error
    expect(() => validateSkillWorkflowSelections(selections, registryWorkflows)).toThrow(
      /non-existent workflow/,
    );
    expect(() => validateSkillWorkflowSelections(selections, registryWorkflows)).toThrow(
      /Available workflows/,
    );
  });

  it('should list all missing workflows in error message', () => {
    // Given skill with multiple missing workflows
    const selections = new Map<string, string[]>([
      ['skill-1', ['missing-1', 'workflow-a', 'missing-2']],
    ]);

    const registryWorkflows = new Set(['workflow-a']);

    // When validating
    try {
      validateSkillWorkflowSelections(selections, registryWorkflows);
      expect.fail('Should have thrown');
    } catch (error) {
      // Then error should list both missing workflows
      const errorMessage = (error as Error).message;
      expect(errorMessage).toContain('missing-1');
      expect(errorMessage).toContain('missing-2');
    }
  });
});
