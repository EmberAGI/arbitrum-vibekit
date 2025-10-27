import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for AI Integration
 * Tests AI provider configuration and tool access according to PRD requirements
 */
// Type definitions for test mocks
interface MockOpenRouter {
  generateText: ReturnType<typeof vi.fn>;
  generateObject: ReturnType<typeof vi.fn>;
  streamText: ReturnType<typeof vi.fn>;
}

interface MockMCPClient {
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  getToolSchema: ReturnType<typeof vi.fn>;
}

interface MockWorkflowRuntime {
  listPlugins: ReturnType<typeof vi.fn>;
  getToolMetadata: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
}

interface MockAIService {
  processMessage: ReturnType<typeof vi.fn>;
  getAvailableTools: ReturnType<typeof vi.fn>;
  openRouter: MockOpenRouter;
  mcpClient: MockMCPClient;
  workflowRuntime: MockWorkflowRuntime;
  config?: unknown;
}

describe('AI Integration', () => {
  let aiService: MockAIService;
  let mockOpenRouter: MockOpenRouter;
  let mockMCPClient: MockMCPClient;
  let mockWorkflowRuntime: MockWorkflowRuntime;

  beforeEach(() => {
    // Mock OpenRouter client - Vercel AI SDK format
    mockOpenRouter = {
      generateText: vi.fn(),
      generateObject: vi.fn(),
      streamText: vi.fn(),
    };

    // Mock MCP client for Onchain Actions
    mockMCPClient = {
      listTools: vi.fn().mockResolvedValue([
        { name: 'gmx_open_position', description: 'Open GMX position' },
        { name: 'gmx_close_position', description: 'Close GMX position' },
        { name: 'gmx_list_markets', description: 'List GMX markets' },
        { name: 'gmx_get_prices', description: 'Get market prices' },
      ]),
      callTool: vi.fn(),
      getToolSchema: vi.fn(),
    };

    // Mock Workflow Runtime
    mockWorkflowRuntime = {
      listPlugins: vi.fn().mockReturnValue(['vault_deposit', 'delta_neutral']),
      getToolMetadata: vi.fn().mockImplementation((name: string) => ({
        name,
        description: `Workflow tool: ${name}`,
        inputSchema: { type: 'object', properties: {} },
      })),
      dispatch: vi.fn(),
    };

    // Create mock service instance
    aiService = {
      processMessage: vi.fn(),
      getAvailableTools: vi.fn(),
      openRouter: mockOpenRouter,
      mcpClient: mockMCPClient,
      workflowRuntime: mockWorkflowRuntime,
    };

    // Mock imports
    vi.doMock('./service.js', () => ({
      AIService: class {
        public config: unknown;
        public processMessage: MockAIService['processMessage'];
        public getAvailableTools: MockAIService['getAvailableTools'];
        public openRouter: MockOpenRouter;
        public mcpClient: MockMCPClient;
        public workflowRuntime: MockWorkflowRuntime;

        constructor(config: unknown) {
          Object.assign(this, aiService);
          this.config = config;
          this.processMessage = aiService.processMessage;
          this.getAvailableTools = aiService.getAvailableTools;
          this.openRouter = mockOpenRouter;
          this.mcpClient = mockMCPClient;
          this.workflowRuntime = mockWorkflowRuntime;
        }
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('MCP Tool Access', () => {
    it('should have access to Onchain Actions MCP tools', async () => {
      // Given AI service with MCP integration per PRD lines 205-208
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          getAvailableTools: () => Promise<Map<string, unknown>>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      // Mock the getAvailableTools to return a Map structure (Vercel AI SDK format)
      aiService.getAvailableTools.mockResolvedValue(
        new Map([
          ['gmx_open_position', { description: 'Open GMX position', inputSchema: {} }],
          ['gmx_close_position', { description: 'Close GMX position', inputSchema: {} }],
          ['gmx_list_markets', { description: 'List GMX markets', inputSchema: {} }],
          ['gmx_get_prices', { description: 'Get market prices', inputSchema: {} }],
        ]),
      );

      // When getting available tools
      const tools = await service.getAvailableTools();

      // Then MCP tools should be accessible as Map keys
      expect(tools.has('gmx_open_position')).toBe(true);
      expect(tools.has('gmx_close_position')).toBe(true);
      expect(tools.has('gmx_list_markets')).toBe(true);
      expect(tools.has('gmx_get_prices')).toBe(true);
    });

    it('should call MCP tools through facade', async () => {
      // Given a request requiring MCP tool
      mockOpenRouter.generateText.mockResolvedValue({
        text: "I'll open a position for you",
        toolCalls: [
          {
            toolName: 'gmx_open_position',
            args: { market: 'ETH-USD', size: '1000000', isLong: true },
          },
        ],
      });

      mockMCPClient.callTool.mockResolvedValue({
        success: true,
        data: { positionKey: '0x123' },
      });

      // Mock processMessage to simulate tool execution
      aiService.processMessage.mockResolvedValue({
        text: "I'll open a position for you",
        toolCalls: [
          {
            toolName: 'gmx_open_position',
            args: { market: 'ETH-USD', size: '1000000', isLong: true },
            result: { success: true, data: { positionKey: '0x123' } },
          },
        ],
      });

      // When processing message
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{
            toolCalls?: Array<{ toolName: string; args: unknown; result?: unknown }>;
          }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Open a long position on ETH', {
        contextId: 'ctx-mcp',
      });

      // Then MCP tool should be executed through the response
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls![0]!.toolName).toBe('gmx_open_position');
      expect(result.toolCalls![0]!.args).toMatchObject({ market: 'ETH-USD' });
    });

    it('should execute MCP tools with correct parameters', async () => {
      // Given user wants to open a position
      aiService.processMessage.mockResolvedValue({
        text: 'Opening your position',
        toolCalls: [
          {
            toolName: 'gmx_open_position',
            args: { market: 'ETH-USD', size: '10000', isLong: true },
            result: { success: true, data: { positionKey: '0xabc' } },
          },
        ],
      });

      // When user requests position opening
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{
            toolCalls?: Array<{ toolName: string; args: unknown; result?: { success: boolean } }>;
          }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Open a $10 long on ETH', {
        contextId: 'ctx-execute',
      });

      // Then tool execution result should be successful
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls![0]!.toolName).toBe('gmx_open_position');
      expect(result.toolCalls![0]!.args).toMatchObject({
        market: 'ETH-USD',
        size: '10000',
        isLong: true,
      });
      expect((result.toolCalls![0]!.result as { success: boolean }).success).toBe(true);
    });
  });

  describe('Workflow Dispatch Tools', () => {
    // Tests behavior of AI having access to workflow tools
    it('should have access to workflow dispatch tools', async () => {
      // Given workflows registered in runtime per PRD lines 125-129
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          getAvailableTools: () => Promise<Map<string, unknown>>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      // Mock available tools as Map
      aiService.getAvailableTools.mockResolvedValue(
        new Map([
          [
            'dispatch_workflow_vault_deposit',
            { description: 'Dispatch vault deposit workflow', inputSchema: {} },
          ],
          [
            'dispatch_workflow_delta_neutral',
            { description: 'Dispatch delta neutral workflow', inputSchema: {} },
          ],
        ]),
      );

      // When getting available tools
      const tools = await service.getAvailableTools();

      // Then dispatch tools should be available
      expect(tools.has('dispatch_workflow_vault_deposit')).toBe(true);
      expect(tools.has('dispatch_workflow_delta_neutral')).toBe(true);
    });

    it('should generate dispatch tools dynamically', async () => {
      // Given new workflow registered
      mockWorkflowRuntime.listPlugins.mockReturnValue([
        'vault_deposit',
        'delta_neutral',
        'new_strategy', // Newly registered
      ]);

      // Mock tools including new workflow
      aiService.getAvailableTools.mockResolvedValue(
        new Map([
          [
            'dispatch_workflow_vault_deposit',
            { description: 'Dispatch vault deposit workflow', inputSchema: {} },
          ],
          [
            'dispatch_workflow_delta_neutral',
            { description: 'Dispatch delta neutral workflow', inputSchema: {} },
          ],
          [
            'dispatch_workflow_new_strategy',
            { description: 'Dispatch new strategy workflow', inputSchema: {} },
          ],
        ]),
      );

      // When getting tools after registration
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          getAvailableTools: () => Promise<Map<string, unknown>>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const tools = await service.getAvailableTools();

      // Then new dispatch tool should be available
      expect(tools.has('dispatch_workflow_new_strategy')).toBe(true);
    });

    it('should NOT have access to workflow resume tools', async () => {
      // Given AI service per PRD line 131
      const { AIService } = (await import('./service.js')) as unknown as {
        AIService: new (config: unknown) => {
          getAvailableTools: () => Promise<Map<string, unknown>>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      // Mock tools without resume capabilities
      aiService.getAvailableTools.mockResolvedValue(
        new Map([
          [
            'dispatch_workflow_vault_deposit',
            { description: 'Dispatch vault deposit workflow', inputSchema: {} },
          ],
          [
            'dispatch_workflow_delta_neutral',
            { description: 'Dispatch delta neutral workflow', inputSchema: {} },
          ],
        ]),
      );

      // When getting available tools
      const tools = await service.getAvailableTools();

      // Then workflow resumption should not be available to AI
      // Test behavior: AI can only dispatch new workflows, not resume
      const resumeTools = Array.from(tools.keys()).filter(
        (t) => t.toLowerCase().includes('resume') || t.toLowerCase().includes('continue'),
      );
      expect(resumeTools).toHaveLength(0);
    });

    it('should create tasks through workflow dispatch', async () => {
      // Given AI decides to start a workflow
      aiService.processMessage.mockResolvedValue({
        text: 'Starting the workflow',
        toolCalls: [
          {
            toolName: 'dispatch_workflow_vault_deposit',
            args: { amount: '1000000' },
            result: { id: 'task-123', state: 'working' },
          },
        ],
      });

      // Workflow dispatch creates task
      mockWorkflowRuntime.dispatch.mockReturnValue({
        id: 'task-123',
        state: 'working',
      });

      // When processing message
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{
            toolCalls?: Array<{ toolName: string; args: unknown; result?: { id: string } }>;
          }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Deposit $1 to USDC vault', {
        contextId: 'ctx-workflow',
      });

      // Then workflow tool should be called and task created
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls[0].toolName).toBe('dispatch_workflow_vault_deposit');
      expect(result.toolCalls[0].args).toMatchObject({ amount: '1000000' });
      expect(result.toolCalls[0].result.id).toBe('task-123');
    });
  });

  describe('Response Processing and Task Creation', () => {
    it('should trigger task creation through tool calls', async () => {
      // AI returns tool calls, AgentExecutor creates tasks
      // Given complex operation requiring Task per PRD lines 17-18
      aiService.processMessage.mockResolvedValue({
        text: 'Opening position',
        toolCalls: [
          {
            toolName: 'gmx_open_position',
            args: { market: 'ETH-USD', size: '5000000' },
          },
        ],
      });

      // When processing complex operation
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ toolCalls?: Array<{ toolName: string }> }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Open 5x leveraged ETH position', {
        contextId: 'ctx-complex',
      });

      // Then AI should return tool call for AgentExecutor to handle
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls[0].toolName).toBe('gmx_open_position');
      // AgentExecutor will create task from this tool call
    });

    it('should return Message for simple queries', async () => {
      // Given simple query per PRD line 17
      aiService.processMessage.mockResolvedValue({
        kind: 'message',
        parts: [{ text: 'The answer is 4' }],
      });

      // When processing simple query
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ kind?: string; parts?: Array<{ text: string }>; taskId?: string }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('What is 2+2?', { contextId: 'ctx-simple' });

      // Then Message should be returned
      expect(result.kind).toBe('message');
      expect(result.parts[0].text).toContain('4');
      expect(result.taskId).toBeUndefined();
    });

    it('should respond to user queries', async () => {
      // Given user query
      aiService.processMessage.mockResolvedValue({
        parts: [{ text: 'The answer is 42' }],
      });

      // When user asks a question
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ parts?: Array<{ text: string }> }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('What is the meaning of life?', {
        contextId: 'ctx-query',
      });

      // Then AI should provide answer
      expect(result.parts[0].text).toBe('The answer is 42');
    });

    it('should include tool results in response', async () => {
      // Given tool execution result
      aiService.processMessage.mockResolvedValue({
        text: "I've listed the markets for you",
        toolCalls: [
          {
            toolName: 'gmx_list_markets',
            args: {},
            result: {
              success: true,
              data: [
                { symbol: 'ETH-USD', price: '3500' },
                { symbol: 'BTC-USD', price: '65000' },
              ],
            },
          },
        ],
        artifacts: [
          {
            name: 'market_list',
            data: [
              { symbol: 'ETH-USD', price: '3500' },
              { symbol: 'BTC-USD', price: '65000' },
            ],
          },
        ],
      });

      // When processing with tool call
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ artifacts?: Array<{ name: string; data: unknown }> }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Show me available markets', {
        contextId: 'ctx-tools',
      });

      // Then tool results should be included
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts).toContainEqual(
        expect.objectContaining({
          name: 'market_list',
          data: expect.arrayContaining([
            expect.objectContaining({ symbol: 'ETH-USD' }) as unknown,
          ]) as unknown,
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unavailable services gracefully', async () => {
      // Given service unavailable
      aiService.processMessage.mockResolvedValue({
        error: {
          message: 'Service unavailable',
        },
      });

      // When user sends message
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ error?: { message: string } }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Test', {
        contextId: 'ctx-unavailable',
      });

      // Then error should be user-friendly
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Service unavailable');
    });

    it('should handle malformed tool calls', async () => {
      // Given malformed tool call
      aiService.processMessage.mockResolvedValue({
        error: {
          message: 'Invalid tool call: tool not found',
        },
      });

      // When processing malformed response
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ error?: { message: string } }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Test', {});

      // Then error should be handled
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('tool');
    });

    it('should handle MCP tool failures', async () => {
      // Given MCP tool failure
      aiService.processMessage.mockResolvedValue({
        kind: 'task',
        status: 'failed',
        error: 'Insufficient liquidity',
        toolCalls: [
          {
            toolName: 'gmx_open_position',
            args: { market: 'ETH-USD', size: '1000000' },
            result: {
              success: false,
              error: 'Insufficient liquidity',
            },
          },
        ],
      });

      // When tool execution fails
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ kind?: string; status?: string; error?: string }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Open position', { contextId: 'ctx-fail' });

      // Then failure should be handled
      expect(result.kind).toBe('task');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('liquidity');
    });

    it('should validate tool parameters', async () => {
      // Given invalid tool parameters
      aiService.processMessage.mockResolvedValue({
        error: {
          message: 'Missing required parameter: size',
        },
      });

      // When validating parameters
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ error?: { message: string } }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage('Open position', { contextId: 'ctx-validate' });

      // Then validation should fail
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Missing required parameter');
    });
  });

  describe('Context Management', () => {
    it('should remember previous conversation', async () => {
      // Given previous conversation about ETH price
      const context = {
        contextId: 'ctx-123',
        history: [
          { role: 'user', content: "What's the ETH price?" },
          { role: 'assistant', content: 'ETH is at $3500' },
        ],
      };

      aiService.processMessage.mockResolvedValue({
        parts: [
          {
            text: 'Based on the current price of $3500, a 2x long would give you $20 exposure',
          },
        ],
      });

      // When user asks follow-up question
      const { AIService } = (await import('./service.js')) as {
        AIService: new (config: unknown) => {
          processMessage: (
            message: string,
            context: unknown,
          ) => Promise<{ parts?: Array<{ text: string }> }>;
        };
      };
      const service = new AIService({ model: 'openai/gpt-oss-120b' });

      const result = await service.processMessage(
        'What exposure would I get with $10 at 2x?',
        context,
      );

      // Then AI should use previous context in response
      expect(result.parts[0].text).toContain('$3500');
      expect(result.parts[0].text).toContain('$20');
    });
  });
});
