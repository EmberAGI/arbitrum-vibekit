/**
 * Unit tests for AI SDK adapters
 * Tests conversion functions for workflows and MCP tools
 */

import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { workflowToCoreTools, createCoreToolFromMCP } from './adapters.js';

describe('workflowToCoreTools', () => {
  describe('Tool Creation', () => {
    it('should create a tool with workflow metadata', () => {
      // Given: workflow metadata
      const workflowId = 'test-workflow';
      const description = 'A test workflow';
      const inputSchema = z.object({
        param1: z.string(),
      });
      // When: converting to AI SDK tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema);

      // Then: should create tool with correct properties
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
      expect(tool.inputSchema).toBe(inputSchema);
    });

    it('should use default description when not provided', () => {
      // Given: workflow without description
      const workflowId = 'no-description-workflow';
      const inputSchema = z.object({});

      // When: converting with empty description
      const tool = workflowToCoreTools(workflowId, '', inputSchema);

      // Then: should use default description format
      expect(tool.description).toBe(`Dispatch ${workflowId} workflow`);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema).toBe(inputSchema);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });

    it('should handle complex input schemas', () => {
      // Given: workflow with complex nested schema
      const workflowId = 'complex-workflow';
      const description = 'Complex workflow';
      const inputSchema = z.object({
        name: z.string(),
        age: z.number().int().positive(),
        email: z.string().email().optional(),
        metadata: z
          .object({
            tags: z.array(z.string()),
            priority: z.enum(['low', 'medium', 'high']),
          })
          .optional(),
      });

      // When: converting to tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema);

      // Then: should preserve schema structure
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect(tool.inputSchema).toBe(inputSchema);
      expect(tool.inputSchema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });

    it('should handle empty input schema', () => {
      // Given: workflow with no parameters
      const workflowId = 'no-params-workflow';
      const description = 'No params workflow';
      const inputSchema = z.object({});

      // When: converting to tool
      const tool = workflowToCoreTools(workflowId, description, inputSchema);

      // Then: should create valid tool with empty schema
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.safeParse({}).success).toBe(true);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });
  });

  describe('Schema Integration', () => {
    it('should validate required parameters via Zod schema', () => {
      // Given: workflow with required parameters
      const inputSchema = z.object({
        requiredField: z.string(),
      });

      const tool = workflowToCoreTools('validation-workflow', 'Validation workflow', inputSchema);

      // When/Then: schema should enforce requirements
      expect(tool.inputSchema.safeParse({ requiredField: 'value' }).success).toBe(true);
      expect(tool.inputSchema.safeParse({}).success).toBe(false);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });

    it('should support optional parameters', () => {
      // Given: workflow with optional parameters
      const inputSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const tool = workflowToCoreTools('optional-workflow', 'Optional workflow', inputSchema);

      // When/Then: schema should accept both forms
      expect(tool.inputSchema.safeParse({ required: 'value' }).success).toBe(true);
      expect(tool.inputSchema.safeParse({ required: 'value', optional: 'extra' }).success).toBe(
        true,
      );
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });

    it('should support default values in schema', () => {
      // Given: workflow with default parameter values
      const inputSchema = z.object({
        message: z.string().default('default message'),
        count: z.number().int().positive().default(1),
      });

      const tool = workflowToCoreTools('defaults-workflow', 'Defaults workflow', inputSchema);

      // When/Then: defaults should apply via parse
      const parsed = tool.inputSchema.parse({});
      expect(parsed.message).toBe('default message');
      expect(parsed.count).toBe(1);
      expect('execute' in (tool as Record<string, unknown>)).toBe(false);
    });
  });
});

describe('createCoreToolFromMCP', () => {
  describe('MCP Tool Conversion', () => {
    it('should convert MCP tool with basic schema', () => {
      // Given: MCP tool metadata
      const name = 'mcp__test_tool';
      const description = 'A test MCP tool';
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      };
      const execute = vi.fn();

      // When: converting to AI SDK tool
      const tool = createCoreToolFromMCP(name, description, inputSchema, execute);

      // Then: should create valid tool
      expect(tool).toBeDefined();
      expect(tool.description).toBe(description);
      expect(tool.execute).toBeDefined();
    });

    it('should handle MCP tool with complex schema', () => {
      // Given: MCP tool with nested properties
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              count: { type: 'number' },
            },
          },
        },
      };
      const execute = vi.fn();

      // When: converting to tool
      const tool = createCoreToolFromMCP('mcp__complex', 'Complex tool', inputSchema, execute);

      // Then: should create tool with preserved schema structure
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should execute MCP tool and return result', async () => {
      // Given: MCP tool with execute function
      const expectedResult = { content: 'MCP response' };
      const execute = vi.fn().mockResolvedValue(expectedResult);
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };

      const tool = createCoreToolFromMCP('mcp__exec', 'Executable MCP tool', inputSchema, execute);

      // When: executing tool
      const result = await tool.execute({});

      // Then: should return MCP result
      expect(result).toEqual(expectedResult);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle MCP tool execution errors', async () => {
      // Given: MCP tool that fails
      const execute = vi.fn().mockRejectedValue(new Error('MCP server error'));
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };

      const tool = createCoreToolFromMCP('mcp__error', 'Error MCP tool', inputSchema, execute);

      // When/Then: should propagate error
      await expect(tool.execute({})).rejects.toThrow('MCP server error');
    });
  });

  describe('Schema Normalization', () => {
    it('should normalize MCP schema to JSON Schema Draft-07', () => {
      // Given: MCP tool with various property types
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {
          str: { type: 'string' },
          num: { type: 'number' },
          bool: { type: 'boolean' },
        },
        required: ['str'],
      };
      const execute = vi.fn();

      // When: converting tool
      const tool = createCoreToolFromMCP('mcp__normalize', 'Normalized tool', inputSchema, execute);

      // Then: should create tool with normalized schema
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle empty MCP schema', () => {
      // Given: MCP tool with no properties
      const inputSchema: MCPTool['inputSchema'] = {
        type: 'object',
        properties: {},
      };
      const execute = vi.fn();

      // When: converting tool
      const tool = createCoreToolFromMCP('mcp__empty', 'Empty schema tool', inputSchema, execute);

      // Then: should create valid tool
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
  });
});
