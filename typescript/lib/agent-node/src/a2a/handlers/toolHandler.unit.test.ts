/**
 * Unit tests for ToolHandler
 */

import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AIService } from '../../ai/service.js';

import { ToolHandler } from './toolHandler.js';
import type { WorkflowHandler } from './workflowHandler.js';

type MockedFn<T extends (...args: unknown[]) => unknown> = ReturnType<typeof vi.fn<T>>;

type EventBusDouble = {
  publish: MockedFn<(event: unknown) => void>;
  finished: MockedFn<() => void>;
  on: MockedFn<() => EventBusDouble>;
  off: MockedFn<() => EventBusDouble>;
  once: MockedFn<() => EventBusDouble>;
  removeAllListeners: MockedFn<() => EventBusDouble>;
};

type LoggerDouble = {
  debug: MockedFn<() => void>;
  info: MockedFn<() => void>;
  error: MockedFn<() => void>;
};

type LoggerModuleDouble = {
  Logger: {
    getInstance: MockedFn<(...args: unknown[]) => LoggerDouble>;
  };
};

function loggerMockFactory(): LoggerModuleDouble {
  return {
    Logger: {
      getInstance: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      })),
    },
  };
}

vi.mock('../../utils/logger.js', loggerMockFactory);

const createEventBus = (): EventBusDouble => {
  const eventBus: EventBusDouble = {
    publish: vi.fn(),
    finished: vi.fn(),
    on: vi.fn<() => EventBusDouble>(() => eventBus),
    off: vi.fn<() => EventBusDouble>(() => eventBus),
    once: vi.fn<() => EventBusDouble>(() => eventBus),
    removeAllListeners: vi.fn<() => EventBusDouble>(() => eventBus),
  };
  return eventBus;
};

describe('ToolHandler.createToolsBundle (unit)', () => {
  let eventBus: EventBusDouble;
  let mockAIService: Partial<AIService>;
  let mockWorkflowHandler: Partial<WorkflowHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createEventBus();

    mockAIService = {
      getToolsAsRecord: vi.fn().mockReturnValue({}),
    };

    mockWorkflowHandler = {
      dispatchWorkflow: vi.fn(),
    };
  });

  it('creates tools bundle with workflow dispatch tools having execute functions', async () => {
    // Given: AI service provides workflow tools
    const workflowTool: Tool = {
      description: 'Execute token swap workflow',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string' },
          toToken: { type: 'string' },
        },
      },
    };

    const regularTool: Tool = {
      description: 'Get token price',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string' },
        },
      },
      execute: vi.fn(),
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      dispatch_workflow_token_swap: workflowTool,
      get_price: regularTool,
    });

    const toolHandler = new ToolHandler(
      mockAIService as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    // When: Creating tools bundle
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return tools with workflow tools having execute functions
    expect(bundle.tools).toHaveProperty('dispatch_workflow_token_swap');
    expect(bundle.tools).toHaveProperty('get_price');

    const workflowToolResult = bundle.tools['dispatch_workflow_token_swap'];
    expect(workflowToolResult).toBeDefined();
    expect(workflowToolResult.execute).toBeDefined();
    expect(typeof workflowToolResult.execute).toBe('function');

    // And: Regular tool should retain its execute function
    const regularToolResult = bundle.tools['get_price'];
    expect(regularToolResult).toBeDefined();
    expect(regularToolResult.execute).toBe(regularTool.execute);
  });

  it('workflow dispatch tool execute function calls workflowHandler.dispatchWorkflow', async () => {
    // Given: A workflow tool
    const workflowTool: Tool = {
      description: 'Execute lending workflow',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          protocol: { type: 'string' },
        },
      },
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      dispatch_workflow_lending: workflowTool,
    });

    const dispatchResult = {
      result: [{ kind: 'text' as const, text: 'Workflow dispatched' }],
      taskId: 'task-wf-123',
      metadata: {
        workflowName: 'Lending Protocol',
        description: 'Manage lending positions',
        pluginId: 'lending',
      },
    };

    mockWorkflowHandler.dispatchWorkflow = vi.fn().mockResolvedValue(dispatchResult);

    const toolHandler = new ToolHandler(
      mockAIService as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    // When: Creating tools bundle and executing workflow tool
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );
    const workflowToolResult = bundle.tools['dispatch_workflow_lending'];

    const executeResult = await workflowToolResult.execute?.({ amount: 1000, protocol: 'aave' });

    // Then: Should call workflowHandler.dispatchWorkflow with correct params
    expect(mockWorkflowHandler.dispatchWorkflow).toHaveBeenCalledWith(
      'dispatch_workflow_lending',
      { amount: 1000, protocol: 'aave' },
      eventBus,
    );

    // And: Should return the dispatch result
    expect(executeResult).toEqual(dispatchResult);
  });

  it('does not override execute function if workflow tool already has one', async () => {
    // Given: A workflow tool that already has an execute function
    const existingExecute = vi.fn().mockResolvedValue({ custom: 'result' });
    const workflowToolWithExecute: Tool = {
      description: 'Custom workflow tool',
      parameters: { type: 'object', properties: {} },
      execute: existingExecute,
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      dispatch_workflow_custom: workflowToolWithExecute,
    });

    const toolHandler = new ToolHandler(
      mockAIService as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    // When: Creating tools bundle
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should retain existing execute function
    const workflowToolResult = bundle.tools['dispatch_workflow_custom'];
    expect(workflowToolResult.execute).toBe(existingExecute);

    // And: Should not call workflowHandler.dispatchWorkflow when executed
    await workflowToolResult.execute?.({});
    expect(mockWorkflowHandler.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it('works without workflow handler (no workflow tools)', async () => {
    // Given: AI service with regular tools only, no workflow handler
    const regularTool: Tool = {
      description: 'Calculate slippage',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
        },
      },
      execute: vi.fn(),
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      calculate_slippage: regularTool,
    });

    const toolHandler = new ToolHandler(mockAIService as AIService);

    // When: Creating tools bundle without workflow handler
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return tools bundle successfully
    expect(bundle.tools).toHaveProperty('calculate_slippage');
    expect(bundle.tools['calculate_slippage'].execute).toBe(regularTool.execute);
  });

  it('handles workflow tools without workflow handler gracefully', async () => {
    // Given: AI service with workflow tool but no workflow handler
    const workflowTool: Tool = {
      description: 'Execute swap workflow',
      parameters: { type: 'object', properties: {} },
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      dispatch_workflow_swap: workflowTool,
    });

    const toolHandler = new ToolHandler(mockAIService as AIService);

    // When: Creating tools bundle without workflow handler
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return workflow tool without execute function
    const workflowToolResult = bundle.tools['dispatch_workflow_swap'];
    expect(workflowToolResult).toBeDefined();
    expect(workflowToolResult.execute).toBeUndefined();
  });

  it('handles empty tools map', async () => {
    // Given: AI service with no tools
    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({});

    const toolHandler = new ToolHandler(
      mockAIService as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    // When: Creating tools bundle
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return empty tools map
    expect(bundle.tools).toEqual({});
  });

  it('falls back to getAvailableToolsAsMap if getToolsAsRecord not available', async () => {
    // Given: AI service with availableTools Map instead of getToolsAsRecord
    const tool1: Tool = {
      description: 'Tool 1',
      parameters: { type: 'object', properties: {} },
    };

    const tool2: Tool = {
      description: 'Tool 2',
      parameters: { type: 'object', properties: {} },
    };

    const availableToolsMap = new Map<string, Tool>([
      ['tool1', tool1],
      ['tool2', tool2],
    ]);

    const aiServiceWithMap: Partial<AIService> = {
      availableTools: availableToolsMap as unknown as AIService['availableTools'],
    };

    const toolHandler = new ToolHandler(
      aiServiceWithMap as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    // When: Creating tools bundle
    const bundle = toolHandler.createToolsBundle(
      'ctx-test',
      eventBus as unknown as ExecutionEventBus,
    );

    // Then: Should return tools from availableTools Map
    expect(bundle.tools).toHaveProperty('tool1');
    expect(bundle.tools).toHaveProperty('tool2');
    expect(bundle.tools['tool1']).toBe(tool1);
    expect(bundle.tools['tool2']).toBe(tool2);
  });

  it('contextId and eventBus are captured correctly in execute closure', async () => {
    // Given: A workflow tool
    const workflowTool: Tool = {
      description: 'Trading workflow',
      parameters: { type: 'object', properties: {} },
    };

    mockAIService.getToolsAsRecord = vi.fn().mockReturnValue({
      dispatch_workflow_trading: workflowTool,
    });

    const dispatchMock = vi.fn().mockResolvedValue({
      result: [],
      taskId: 'task-123',
      metadata: {
        workflowName: 'Trading',
        description: 'Execute trades',
        pluginId: 'trading',
      },
    });
    mockWorkflowHandler.dispatchWorkflow = dispatchMock;

    const toolHandler = new ToolHandler(
      mockAIService as AIService,
      mockWorkflowHandler as WorkflowHandler,
    );

    const contextId1 = 'ctx-first';
    const contextId2 = 'ctx-second';
    const eventBus1 = createEventBus();
    const eventBus2 = createEventBus();

    // When: Creating multiple tools bundles with different contextId/eventBus
    const bundle1 = toolHandler.createToolsBundle(
      contextId1,
      eventBus1 as unknown as ExecutionEventBus,
    );
    const bundle2 = toolHandler.createToolsBundle(
      contextId2,
      eventBus2 as unknown as ExecutionEventBus,
    );

    // Execute from both bundles
    await bundle1.tools['dispatch_workflow_trading'].execute?.({ action: 'buy' });
    await bundle2.tools['dispatch_workflow_trading'].execute?.({ action: 'sell' });

    // Then: Each execute should use its own captured contextId and eventBus
    expect(dispatchMock).toHaveBeenCalledTimes(2);

    expect(dispatchMock).toHaveBeenNthCalledWith(
      1,
      'dispatch_workflow_trading',
      { action: 'buy' },
      eventBus1,
    );

    expect(dispatchMock).toHaveBeenNthCalledWith(
      2,
      'dispatch_workflow_trading',
      { action: 'sell' },
      eventBus2,
    );
  });
});
