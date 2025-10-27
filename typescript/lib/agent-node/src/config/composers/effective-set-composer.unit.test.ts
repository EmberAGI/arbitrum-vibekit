/**
 * Unit tests for effective-set-composer
 * Tests MCP server and workflow deduplication and namespacing logic
 */

import { describe, it, expect, vi } from 'vitest';

import type { LoadedMCPRegistry } from '../loaders/mcp-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';
import type { LoadedWorkflowRegistry } from '../loaders/workflow-loader.js';

import { composeEffectiveMCPServers, composeEffectiveWorkflows } from './effective-set-composer.js';

// Mock validators
vi.mock('../validators/conflict-validator.js', () => ({
  validateMCPServers: vi.fn(),
  validateWorkflows: vi.fn(),
}));
vi.mock('../validators/tool-validator.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateToolNames: vi.fn(),
  };
});

describe('composeEffectiveMCPServers', () => {
  const mockMCPRegistry: LoadedMCPRegistry = {
    path: '/test/mcp.json',
    registry: {
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['server.js'],
        },
        'another-server': {
          command: 'python',
          args: ['server.py'],
        },
      },
    },
    resolvedRegistry: {
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['server.js'],
        },
        'another-server': {
          command: 'python',
          args: ['server.py'],
        },
      },
    },
  };

  it('should return empty array when no skills reference MCP servers', () => {
    // Given skills with no MCP server references
    const skills: LoadedSkill[] = [
      {
        body: 'Test skill',
        path: '/test/skill.md',
        frontmatter: {
          skill: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
        },
      },
    ];

    // When composing effective MCP servers
    const result = composeEffectiveMCPServers(mockMCPRegistry, skills);

    // Then result should be empty
    expect(result).toEqual([]);
  });

  it('should include MCP server referenced by skill', () => {
    // Given a skill referencing an MCP server
    const skills: LoadedSkill[] = [
      {
        body: 'Test skill',
        path: '/test/skill.md',
        frontmatter: {
          skill: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          mcp: {
            servers: [{ name: 'test-server' }],
          },
        },
      },
    ];

    // When composing effective MCP servers
    const result = composeEffectiveMCPServers(mockMCPRegistry, skills);

    // Then the server should be included
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('test-server');
    expect(result[0]?.namespace).toBe('test_server'); // canonicalized
    expect(result[0]?.usedBySkills).toEqual(['test-skill']);
  });

  it('should deduplicate MCP server used by multiple skills', () => {
    // Given multiple skills referencing same MCP server
    const skills: LoadedSkill[] = [
      {
        body: 'Skill 1',
        path: '/test/skill1.md',
        frontmatter: {
          skill: {
            id: 'skill-1',
            name: 'Skill 1',
            description: 'Skill 1',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          mcp: {
            servers: [{ name: 'test-server' }],
          },
        },
      },
      {
        body: 'Skill 2',
        path: '/test/skill2.md',
        frontmatter: {
          skill: {
            id: 'skill-2',
            name: 'Skill 2',
            description: 'Skill 2',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          mcp: {
            servers: [{ name: 'test-server' }],
          },
        },
      },
    ];

    // When composing effective MCP servers
    const result = composeEffectiveMCPServers(mockMCPRegistry, skills);

    // Then server should appear once with both skills
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('test-server');
    expect(result[0]?.usedBySkills).toEqual(['skill-1', 'skill-2']);
  });

  it('should handle allowedTools filtering with namespacing', () => {
    // Given a skill with allowed tools
    const skills: LoadedSkill[] = [
      {
        body: 'Test skill',
        path: '/test/skill.md',
        frontmatter: {
          skill: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          mcp: {
            servers: [
              {
                name: 'test-server',
                allowedTools: ['tool1', 'tool2'],
              },
            ],
          },
        },
      },
    ];

    // When composing effective MCP servers
    const result = composeEffectiveMCPServers(mockMCPRegistry, skills);

    // Then allowed tools should be stored un-namespaced
    expect(result).toHaveLength(1);
    expect(result[0]?.allowedTools).toEqual(['tool1', 'tool2']);
  });
});

describe('composeEffectiveWorkflows', () => {
  const mockWorkflowRegistry: LoadedWorkflowRegistry = {
    path: '/test/workflow.json',
    registry: {
      workflows: [
        {
          id: 'workflow-1',
          url: 'https://example.com/workflow1',
          enabled: true,
        },
        {
          id: 'workflow-2',
          url: 'https://example.com/workflow2',
          enabled: false,
        },
      ],
    },
  };

  it('should return empty array when no skills reference workflows', () => {
    // Given skills with no workflow references
    const skills: LoadedSkill[] = [
      {
        body: 'Test skill',
        path: '/test/skill.md',
        frontmatter: {
          skill: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
        },
      },
    ];

    // When composing effective workflows
    const result = composeEffectiveWorkflows(mockWorkflowRegistry, skills);

    // Then result should be empty
    expect(result).toEqual([]);
  });

  it('should include workflow referenced by skill', () => {
    // Given a skill referencing a workflow
    const skills: LoadedSkill[] = [
      {
        body: 'Test skill',
        path: '/test/skill.md',
        frontmatter: {
          skill: {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          workflows: {
            include: ['workflow-1'],
          },
        },
      },
    ];

    // When composing effective workflows
    const result = composeEffectiveWorkflows(mockWorkflowRegistry, skills);

    // Then the workflow should be included
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('workflow-1');
    expect(result[0]?.usedBySkills).toEqual(['test-skill']);
    expect(result[0]?.entry.url).toBe('https://example.com/workflow1');
  });

  it('should deduplicate workflow used by multiple skills', () => {
    // Given multiple skills referencing same workflow
    const skills: LoadedSkill[] = [
      {
        body: 'Skill 1',
        path: '/test/skill1.md',
        frontmatter: {
          skill: {
            id: 'skill-1',
            name: 'Skill 1',
            description: 'Skill 1',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          workflows: {
            include: ['workflow-1'],
          },
        },
      },
      {
        body: 'Skill 2',
        path: '/test/skill2.md',
        frontmatter: {
          skill: {
            id: 'skill-2',
            name: 'Skill 2',
            description: 'Skill 2',
            tags: [],
            examples: [],
            inputModes: [],
            outputModes: [],
          },
          workflows: {
            include: ['workflow-1'],
          },
        },
      },
    ];

    // When composing effective workflows
    const result = composeEffectiveWorkflows(mockWorkflowRegistry, skills);

    // Then workflow should appear once with both skills
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('workflow-1');
    expect(result[0]?.usedBySkills).toEqual(['skill-1', 'skill-2']);
  });
});
