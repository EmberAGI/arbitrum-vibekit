import type { Tool } from 'ai';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import type { MCPClientManager } from '../clients/MCPClientManager.js';

import { ToolRegistry } from './ToolRegistry.js';
import type { WorkflowToolManager } from './WorkflowToolManager.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockMCPManager: {
    getTools: Mock;
    isMCPTool: Mock;
    executeTool: Mock;
  };
  let mockWorkflowManager: {
    getTools: Mock;
    isWorkflowTool: Mock;
    executeWorkflow: Mock;
  };

  beforeEach(() => {
    // Create mock managers
    mockMCPManager = {
      getTools: vi.fn(() => new Map()),
      isMCPTool: vi.fn(() => false),
      executeTool: vi.fn(),
    };

    mockWorkflowManager = {
      getTools: vi.fn(() => new Map()),
      isWorkflowTool: vi.fn(() => false),
      executeWorkflow: vi.fn(),
    };

    registry = new ToolRegistry(
      mockMCPManager as unknown as MCPClientManager,
      mockWorkflowManager as unknown as WorkflowToolManager,
    );
  });

  describe('tool registration and retrieval', () => {
    it('aggregates tools from both MCP and workflow managers', () => {
      // Given MCP and workflow tools
      const mcpTools = new Map<string, Tool>([
        ['mcp__tool_1', { description: 'MCP Tool 1' } as Tool],
        ['mcp__tool_2', { description: 'MCP Tool 2' } as Tool],
      ]);

      const workflowTools = new Map<string, Tool>([
        ['workflow__trading', { description: 'Trading Workflow' } as Tool],
        ['workflow__lending', { description: 'Lending Workflow' } as Tool],
      ]);

      mockMCPManager.getTools.mockReturnValue(mcpTools);
      mockWorkflowManager.getTools.mockReturnValue(workflowTools);

      // When updating the registry
      registry.updateRegistry();

      // Then all tools should be available
      const allTools = registry.getAllTools();
      expect(allTools.size).toBe(4);
      expect(allTools.has('mcp__tool_1')).toBe(true);
      expect(allTools.has('mcp__tool_2')).toBe(true);
      expect(allTools.has('workflow__trading')).toBe(true);
      expect(allTools.has('workflow__lending')).toBe(true);
    });

    it('clears previous tools when updating registry', () => {
      // Given an initial set of tools
      const initialTools = new Map<string, Tool>([
        ['server__old_tool', { description: 'Old Tool' } as Tool],
      ]);
      mockMCPManager.getTools.mockReturnValue(initialTools);
      registry.updateRegistry();

      // When updating with new tools
      const newTools = new Map<string, Tool>([
        ['server__new_tool', { description: 'New Tool' } as Tool],
      ]);
      mockMCPManager.getTools.mockReturnValue(newTools);
      mockWorkflowManager.getTools.mockReturnValue(new Map());
      registry.updateRegistry();

      // Then old tools should be removed
      const allTools = registry.getAllTools();
      expect(allTools.size).toBe(1);
      expect(allTools.has('server__old_tool')).toBe(false);
      expect(allTools.has('server__new_tool')).toBe(true);
    });

    it('handles empty tool sets gracefully', () => {
      // Given no tools from either manager
      mockMCPManager.getTools.mockReturnValue(new Map());
      mockWorkflowManager.getTools.mockReturnValue(new Map());

      // When updating the registry
      registry.updateRegistry();

      // Then registry should be empty
      expect(registry.getAllTools().size).toBe(0);
      expect(registry.getToolNames()).toEqual([]);
    });
  });

  describe('tool access methods', () => {
    beforeEach(() => {
      // Setup some test tools
      const tools = new Map<string, Tool>([
        ['server__tool_a', { description: 'Tool A' } as Tool],
        ['server__tool_b', { description: 'Tool B' } as Tool],
        ['server__tool_c', { description: 'Tool C' } as Tool],
      ]);
      mockMCPManager.getTools.mockReturnValue(tools);
      registry.updateRegistry();
    });

    it('returns all tool names as an array', () => {
      // When getting tool names
      const names = registry.getToolNames();

      // Then should return array of names
      expect(names).toEqual(['server__tool_a', 'server__tool_b', 'server__tool_c']);
    });

    it('retrieves specific tool by name', () => {
      // When getting a specific tool
      const tool = registry.getTool('server__tool_b');

      // Then should return the tool
      expect(tool).toBeDefined();
      expect(tool?.description).toBe('Tool B');
    });

    it('returns undefined for non-existent tool', () => {
      // When getting a non-existent tool
      const tool = registry.getTool('server__non_existent');

      // Then should return undefined
      expect(tool).toBeUndefined();
    });

    it('checks tool existence correctly', () => {
      // When checking tool existence
      expect(registry.hasTool('server__tool_a')).toBe(true);
      expect(registry.hasTool('server__tool_c')).toBe(true);
      expect(registry.hasTool('server__non_existent')).toBe(false);
    });
  });

  describe('tool execution', () => {
    it('executes tools with built-in execute method', async () => {
      // Given a tool with execute method
      const mockExecute = vi.fn().mockResolvedValue({ result: 'success' });
      const executableTool = {
        description: 'Executable Tool',
        execute: mockExecute,
      } as unknown as Tool;

      const tools = new Map<string, Tool>([['server__executable_tool', executableTool]]);
      mockMCPManager.getTools.mockReturnValue(tools);
      registry.updateRegistry();

      // When executing the tool
      const result = await registry.executeTool('server__executable_tool', { param: 'value' });

      // Then the tool's execute method should be called
      expect(mockExecute).toHaveBeenCalledWith({ param: 'value' });
      expect(result).toEqual({ result: 'success' });
    });

    it('delegates MCP tool execution to MCP manager', async () => {
      // Given an MCP tool
      const tools = new Map<string, Tool>([['mcp__tool', { description: 'MCP Tool' } as Tool]]);
      mockMCPManager.getTools.mockReturnValue(tools);
      mockMCPManager.isMCPTool.mockReturnValue(true);
      mockMCPManager.executeTool.mockResolvedValue({ mcp_result: 'data' });
      registry.updateRegistry();

      // When executing the MCP tool
      const result = await registry.executeTool('mcp__tool', { input: 'test' });

      // Then execution should be delegated to MCP manager
      expect(mockMCPManager.isMCPTool).toHaveBeenCalledWith('mcp__tool');
      expect(mockMCPManager.executeTool).toHaveBeenCalledWith('mcp__tool', { input: 'test' });
      expect(result).toEqual({ mcp_result: 'data' });
    });

    it('delegates workflow tool execution to workflow manager', async () => {
      // Given a workflow tool
      const tools = new Map<string, Tool>([
        ['workflow__test', { description: 'Workflow Tool' } as Tool],
      ]);
      mockWorkflowManager.getTools.mockReturnValue(tools);
      mockWorkflowManager.isWorkflowTool.mockReturnValue(true);
      mockWorkflowManager.executeWorkflow.mockResolvedValue({ workflow_result: 'completed' });
      registry.updateRegistry();

      // When executing the workflow tool
      const result = await registry.executeTool('workflow__test', { config: 'data' });

      // Then execution should be delegated to workflow manager
      expect(mockWorkflowManager.isWorkflowTool).toHaveBeenCalledWith('workflow__test');
      expect(mockWorkflowManager.executeWorkflow).toHaveBeenCalledWith('workflow__test', {
        config: 'data',
      });
      expect(result).toEqual({ workflow_result: 'completed' });
    });

    it('throws error for unknown tools', async () => {
      // Given no tools registered
      registry.updateRegistry();

      // When executing an unknown tool
      // Then should throw an error
      await expect(registry.executeTool('server__unknown_tool', {})).rejects.toThrow(
        'Unknown tool: server__unknown_tool',
      );
    });

    it('prioritizes tool execute method over manager delegation', async () => {
      // Given a tool with execute method that is also an MCP tool
      const mockExecute = vi.fn().mockResolvedValue({ direct: 'result' });
      const hybridTool = {
        description: 'Hybrid Tool',
        execute: mockExecute,
      } as unknown as Tool;

      const tools = new Map<string, Tool>([['hybrid__tool', hybridTool]]);
      mockMCPManager.getTools.mockReturnValue(tools);
      mockMCPManager.isMCPTool.mockReturnValue(true);
      mockMCPManager.executeTool.mockResolvedValue({ mcp: 'result' });
      registry.updateRegistry();

      // When executing the tool
      const result = await registry.executeTool('hybrid__tool', { test: 'data' });

      // Then the tool's execute method should be called, not MCP manager
      expect(mockExecute).toHaveBeenCalledWith({ test: 'data' });
      expect(mockMCPManager.executeTool).not.toHaveBeenCalled();
      expect(result).toEqual({ direct: 'result' });
    });
  });

  describe('createToolsBundle', () => {
    it('creates a bundle with tools and onToolCall function', () => {
      // Given some registered tools
      const tools = new Map<string, Tool>([
        ['server__tool_1', { description: 'Tool 1' } as Tool],
        ['server__tool_2', { description: 'Tool 2' } as Tool],
      ]);
      mockMCPManager.getTools.mockReturnValue(tools);
      registry.updateRegistry();

      // When creating a tools bundle
      const bundle = registry.createToolsBundle();

      // Then bundle should contain tools and onToolCall
      expect(bundle.tools).toBeDefined();
      expect(bundle.tools['server__tool_1']).toBeDefined();
      expect(bundle.tools['server__tool_2']).toBeDefined();
      expect(typeof bundle.onToolCall).toBe('function');
    });

    it('onToolCall delegates to executeTool', async () => {
      // Given a tool with execute method
      const mockExecute = vi.fn().mockResolvedValue({ executed: true });
      const tool = { description: 'Test', execute: mockExecute } as unknown as Tool;
      const tools = new Map<string, Tool>([['server__test_tool', tool]]);
      mockMCPManager.getTools.mockReturnValue(tools);
      registry.updateRegistry();

      // When calling onToolCall from bundle
      const bundle = registry.createToolsBundle();
      const result = await bundle.onToolCall('server__test_tool', { arg: 'value' });

      // Then it should execute the tool
      expect(mockExecute).toHaveBeenCalledWith({ arg: 'value' });
      expect(result).toEqual({ executed: true });
    });

    it('creates empty bundle when no tools registered', () => {
      // Given no tools
      registry.updateRegistry();

      // When creating a bundle
      const bundle = registry.createToolsBundle();

      // Then bundle should be empty but valid
      expect(bundle.tools).toEqual({});
      expect(typeof bundle.onToolCall).toBe('function');
    });
  });

  describe('manager integration', () => {
    it('works without MCP manager', () => {
      // Given registry without MCP manager
      const registryNoMCP = new ToolRegistry(
        undefined,
        mockWorkflowManager as unknown as WorkflowToolManager,
      );

      const workflowTools = new Map<string, Tool>([
        ['workflow__tool', { description: 'Workflow' } as Tool],
      ]);
      mockWorkflowManager.getTools.mockReturnValue(workflowTools);

      // When updating registry
      registryNoMCP.updateRegistry();

      // Then only workflow tools should be available
      const allTools = registryNoMCP.getAllTools();
      expect(allTools.size).toBe(1);
      expect(allTools.has('workflow__tool')).toBe(true);
    });

    it('works without workflow manager', () => {
      // Given registry without workflow manager
      const registryNoWorkflow = new ToolRegistry(
        mockMCPManager as unknown as MCPClientManager,
        undefined,
      );

      const mcpTools = new Map<string, Tool>([['mcp__tool', { description: 'MCP' } as Tool]]);
      mockMCPManager.getTools.mockReturnValue(mcpTools);

      // When updating registry
      registryNoWorkflow.updateRegistry();

      // Then only MCP tools should be available
      const allTools = registryNoWorkflow.getAllTools();
      expect(allTools.size).toBe(1);
      expect(allTools.has('mcp__tool')).toBe(true);
    });

    it('works without any managers', () => {
      // Given registry without any managers
      const emptyRegistry = new ToolRegistry(undefined, undefined);

      // When updating registry
      emptyRegistry.updateRegistry();

      // Then registry should be empty but functional
      expect(emptyRegistry.getAllTools().size).toBe(0);
      expect(emptyRegistry.getToolNames()).toEqual([]);
      expect(emptyRegistry.hasTool('any')).toBe(false);
    });
  });
});
