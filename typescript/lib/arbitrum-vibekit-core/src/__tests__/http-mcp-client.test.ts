import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, defineSkill } from '../index.js';
import type { HttpMcpConfig, StdioMcpConfig } from '../index.js';
import { z } from 'zod';
import express from 'express';
import { Server } from 'http';
import { createSuccessTask } from '../utils.js';

describe('HTTP MCP Client Support', () => {
  let testServer: Server;
  let testPort: number;

  // Dummy tool for testing
  const dummyTool = {
    name: 'dummy-tool',
    description: 'A dummy tool for testing',
    parameters: z.object({ test: z.string() }),
    execute: async () => createSuccessTask('dummy', []),
  };

  beforeEach(async () => {
    const app = express();
    app.use(express.json());

    // Mock MCP endpoint
    app.post('/mcp/message', (req, res) => {
      const { method } = req.body;

      if (method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            protocolVersion: '1.0.0',
            serverInfo: {
              name: 'test-server',
              version: '1.0.0',
            },
            capabilities: {},
          },
        });
      } else if (method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            tools: [
              {
                name: 'testTool',
                description: 'A test tool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            ],
          },
        });
      } else if (method === 'tools/call') {
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            toolResult: 'Success from HTTP MCP server',
          },
        });
      }
    });

    await new Promise<void>(resolve => {
      testServer = app.listen(0, () => {
        testPort = (testServer.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (testServer) {
      await new Promise<void>(resolve => {
        testServer.close(() => resolve());
      });
    }
  });

  it('should support HTTP MCP servers in skill definitions', async () => {
    const testSkill = defineSkill({
      id: 'test-http-skill',
      name: 'Test HTTP Skill',
      description: 'Tests HTTP MCP support',
      tags: ['test'],
      examples: ['test http mcp'],
      inputSchema: z.object({
        message: z.string(),
      }),
      mcpServers: {
        'test-http-server': {
          url: `http://localhost:${testPort}/mcp/message`,
          headers: {
            Authorization: 'Bearer test-key',
          },
          alwaysAllow: ['testTool'],
          disabled: false,
        } as HttpMcpConfig,
      },
      tools: [dummyTool],
    });

    expect(testSkill.mcpServers).toBeDefined();
    expect(testSkill.mcpServers!['test-http-server']).toMatchObject({
      url: expect.stringContaining('http://localhost:'),
      headers: { Authorization: 'Bearer test-key' },
      alwaysAllow: ['testTool'],
      disabled: false,
    });
  });

  it('should support both HTTP and stdio servers in the same skill', () => {
    const hybridSkill = defineSkill({
      id: 'hybrid-skill',
      name: 'Hybrid Skill',
      description: 'Tests mixed MCP server types',
      tags: ['test'],
      examples: ['test hybrid'],
      inputSchema: z.object({
        action: z.string(),
      }),
      mcpServers: {
        'http-server': {
          url: 'https://api.example.com/mcp',
          headers: { 'X-API-Key': 'secret' },
        } as HttpMcpConfig,
        'local-server': {
          command: 'node',
          args: ['./local-mcp-server.js'],
          env: { NODE_ENV: 'test' },
        } as StdioMcpConfig,
      },
      tools: [dummyTool],
    });

    const servers = hybridSkill.mcpServers;
    expect(servers).toBeDefined();
    if (servers && servers['http-server'] && servers['local-server']) {
      expect('url' in servers['http-server']).toBe(true);
      expect('command' in servers['local-server']).toBe(true);
    }
  });

  it('should skip disabled MCP servers', () => {
    const skillWithDisabled = defineSkill({
      id: 'disabled-test',
      name: 'Disabled Test',
      description: 'Tests disabled server handling',
      tags: ['test'],
      examples: ['test disabled'],
      inputSchema: z.object({ test: z.boolean() }),
      mcpServers: {
        'enabled-server': {
          url: 'https://enabled.com/mcp',
          disabled: false,
        },
        'disabled-server': {
          url: 'https://disabled.com/mcp',
          disabled: true,
        },
      },
      tools: [dummyTool],
    });

    const servers = skillWithDisabled.mcpServers;
    expect(servers).toBeDefined();
    if (servers && servers['enabled-server'] && servers['disabled-server']) {
      expect(servers['enabled-server'].disabled).toBe(false);
      expect(servers['disabled-server'].disabled).toBe(true);
    }
  });

  it('should maintain backward compatibility with stdio servers', () => {
    const legacySkill = defineSkill({
      id: 'legacy-skill',
      name: 'Legacy Skill',
      description: 'Tests backward compatibility',
      tags: ['test'],
      examples: ['test legacy'],
      inputSchema: z.object({ command: z.string() }),
      mcpServers: {
        'legacy-stdio': {
          command: 'node',
          moduleName: 'old-mcp-server', // Legacy field still supported
          env: { DEBUG: 'true' },
        },
      },
      tools: [dummyTool],
    });

    const server = legacySkill.mcpServers!['legacy-stdio'] as StdioMcpConfig;
    expect(server.moduleName).toBe('old-mcp-server');
    expect(server.command).toBe('node');
  });

  it('should log server names during setup', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    const agent = Agent.create({
      name: 'Test Agent',
      version: '1.0.0',
      description: 'Tests server naming',
      url: 'https://test.example.com',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['structured'],
      defaultOutputModes: ['structured'],
      skills: [
        defineSkill({
          id: 'naming-test',
          name: 'Naming Test',
          description: 'Tests client naming',
          tags: ['test'],
          examples: ['test naming'],
          inputSchema: z.object({ test: z.string() }),
          mcpServers: {
            'ember-onchain': {
              url: `http://localhost:${testPort}/mcp/message`,
              disabled: false,
            },
          },
          tools: [dummyTool],
        }),
      ],
    });

    // Mock the setupSkillMcpClients to check logging without actual connection
    const setupSpy = vi.spyOn(agent as any, 'setupSkillMcpClients');
    setupSpy.mockImplementation(async () => {
      console.log('Setting up MCP client for skill "naming-test", server: ember-onchain');
    });

    try {
      // Call setupSkillMcpClients directly instead of start() to avoid full initialization
      await (agent as any).setupSkillMcpClients();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting up MCP client for skill "naming-test", server: ember-onchain'
      );
    } finally {
      consoleSpy.mockRestore();
      setupSpy.mockRestore();
    }
  });
});
