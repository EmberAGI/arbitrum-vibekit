import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateProtocolTool } from '../src/tools/evaluateProtocol.js';
import type { TaskContext } from '@emberai/arbitrum-vibekit-core';

describe('evaluateProtocol Tool', () => {
  let mockContext: TaskContext;
  let mockMcpClient: any;

  beforeEach(() => {
    mockMcpClient = {
      callTool: vi.fn(),
    };

    mockContext = {
      mcpClients: {
        '/app/lib/mcp-tools/defisafety-implementation/dist/index.js': mockMcpClient,
      },
    } as any;
  });

  it('should successfully evaluate a protocol with valid response', async () => {
    const mockEvaluationResult = {
      projectName: 'Aave',
      overallScore: 85,
      scoreCategory: 'Good',
      evaluation: {
        Q1: { score: 90, weight: 15, justification: 'Contract addresses well documented' },
        Q2: { score: 80, weight: 5, justification: 'Repository accessible' },
      },
    };

    mockMcpClient.callTool.mockResolvedValue({
      content: [{ text: JSON.stringify(mockEvaluationResult) }],
    });

    const input = {
      projectName: 'Aave',
      baseUrl: 'https://docs.aave.com',
      maxPages: 100,
    };

    const result = await evaluateProtocolTool.execute(input, mockContext);

    expect(result.status).toBe('success');
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0].name).toContain('Raw Data');
    expect(result.artifacts[1].name).toContain('Safety Report');
    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'evaluate_defisafety_criteria',
      arguments: {
        projectName: 'Aave',
        baseUrl: 'https://docs.aave.com',
        maxPages: 100,
      },
    });
  });

  it('should handle MCP server not connected error', async () => {
    const contextWithoutMcp = {
      mcpClients: {},
    } as any;

    const input = {
      projectName: 'Aave',
      baseUrl: 'https://docs.aave.com',
      maxPages: 100,
    };

    const result = await evaluateProtocolTool.execute(input, contextWithoutMcp);

    expect(result.status).toBe('error');
    expect(result.error.message).toContain('MCP server not connected');
  });

  it('should handle MCP server error response', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      content: [{ text: 'Error: Failed to scrape documentation' }],
    });

    const input = {
      projectName: 'BadProtocol',
      baseUrl: 'https://invalid-docs.com',
      maxPages: 50,
    };

    const result = await evaluateProtocolTool.execute(input, mockContext);

    expect(result.status).toBe('error');
    expect(result.error.message).toBe('Error: Failed to scrape documentation');
  });

  it('should handle non-JSON response gracefully', async () => {
    const textResponse = 'Protocol evaluation completed successfully with some detailed analysis';
    
    mockMcpClient.callTool.mockResolvedValue({
      content: [{ text: textResponse }],
    });

    const input = {
      projectName: 'TestProtocol',
      baseUrl: 'https://test-docs.com',
      maxPages: 25,
    };

    const result = await evaluateProtocolTool.execute(input, mockContext);

    expect(result.status).toBe('success');
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0].content[0].text).toContain(textResponse);
  });

  it('should validate input parameters', () => {
    const schema = evaluateProtocolTool.parameters;
    
    // Valid input
    const validInput = {
      projectName: 'Aave',
      baseUrl: 'https://docs.aave.com',
      maxPages: 100,
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid URL
    const invalidUrl = {
      projectName: 'Aave',
      baseUrl: 'not-a-url',
      maxPages: 100,
    };
    expect(() => schema.parse(invalidUrl)).toThrow();

    // Invalid maxPages
    const invalidPages = {
      projectName: 'Aave', 
      baseUrl: 'https://docs.aave.com',
      maxPages: 0,
    };
    expect(() => schema.parse(invalidPages)).toThrow();
  });
});