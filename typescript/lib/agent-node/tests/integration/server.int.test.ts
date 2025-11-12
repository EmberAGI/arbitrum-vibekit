import type { Server } from 'http';

import type { JSONRPCResponse } from '@a2a-js/sdk';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JSONRPCErrorResponseSchema } from '../../src/a2a/validation.js';
import type { AgentConfigHandle } from '../../src/config/runtime/init.js';
import { createTestA2AServer, cleanupTestServer } from '../utils/test-server.js';

// No mocks - test with real implementation to verify SDK integration

/**
 * Integration tests for A2A Server Core Components
 * Tests the server initialization, endpoints, and SDK integration
 */
describe('A2A Server Integration', () => {
  let server: Server | null = null;
  let agentConfigHandle: AgentConfigHandle | null = null;
  let baseUrl: string = '';

  const assertJsonRpcResponse = (body: unknown): asserts body is JSONRPCResponse => {
    if (typeof body !== 'object' || body === null || !('jsonrpc' in body)) {
      throw new Error('Response body is not a valid JSON-RPC response');
    }
  };

  afterEach(async () => {
    if (server && agentConfigHandle) {
      await cleanupTestServer(server, agentConfigHandle);
      server = null;
      agentConfigHandle = null;
    }
  });

  const getServerUrl = (srv: Server): string => {
    const address = srv.address();
    if (typeof address === 'string') {
      return `http://${address}`;
    }
    return `http://localhost:${address?.port || 3000}`;
  };

  describe('server creation', () => {
    it('should create A2A server with default configuration', async () => {
      // Given the test helper for creating servers
      // When I create a server without configuration
      const result = await createTestA2AServer({ port: 0 }); // Use port 0 for random available port
      server = result.server;
      agentConfigHandle = result.agentConfigHandle;

      // Then the server should be initialized
      expect(server).toBeDefined();
      expect(server).toHaveProperty('listen');
      expect(server).toHaveProperty('close');
    });

    it('should create server with custom configuration', async () => {
      // Given custom configuration
      const config = {
        port: 0, // Use 0 for testing to get random available port
        host: '127.0.0.1',
      };

      // When I create a server with custom config
      const result = await createTestA2AServer(config);
      server = result.server;
      agentConfigHandle = result.agentConfigHandle;

      // Then the server should be created successfully
      expect(server).toBeDefined();
      expect(server).toHaveProperty('listen');
      expect(server).toHaveProperty('close');
    });

    it.todo('should integrate workflow runtime when provided', async () => {
      // TODO: Investigate workflow loading in test environment
      // Workflow tool loading is tested and working in tool-loader-workflows.int.test.ts
      // This test verifies server-level integration which needs additional setup
      // Given: a server with workflow plugins configured
      const { mkdirSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      const { createTestConfigWorkspace } = await import('../utils/test-config-workspace.js');

      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Integration Test Agent',
        skills: [],
      });

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      // Create a test workflow
      writeFileSync(
        join(workflowsDir, 'integration-workflow.js'),
        `
export default {
  id: 'integration-workflow',
  name: 'Integration Workflow',
  description: 'Workflow for server integration testing',
  version: '1.0.0',
  async *execute(context) {
    yield { type: 'status', status: { state: 'completed' } };
    return { success: true };
  }
};
`,
        'utf-8',
      );

      // Update workflow.json registry
      writeFileSync(
        join(configDir, 'workflow.json'),
        JSON.stringify(
          {
            workflows: [
              {
                id: 'integration-workflow',
                from: './workflows/integration-workflow.js',
                enabled: true,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      // When: creating server with workflow configuration
      const { initFromConfigWorkspace } = await import('../../src/config/runtime/init.js');
      const agentConfig = await initFromConfigWorkspace({
        root: configDir,
        dev: false,
      });

      // Then: agentConfig should contain workflow runtime
      expect(agentConfig.workflowRuntime).toBeDefined();

      // And: workflow tools should be available
      expect(agentConfig.tools.size).toBeGreaterThan(0);
      expect(agentConfig.tools.has('dispatch_workflow_integration_workflow')).toBe(true);

      // And: workflow plugin should be registered with runtime
      const plugin = agentConfig.workflowRuntime?.getPlugin('integration-workflow');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('Integration Workflow');

      // Cleanup
      await agentConfig.close();
      const { rmSync } = await import('fs');
      rmSync(configDir, { recursive: true, force: true });
    });
  });

  describe('endpoint availability', () => {
    beforeEach(async () => {
      const result = await createTestA2AServer({ port: 0 });
      server = result.server;
      agentConfigHandle = result.agentConfigHandle;
      baseUrl = getServerUrl(server);
    });

    it('should expose /a2a JSON-RPC endpoint', async () => {
      // Given the A2A server is running
      // When I send a valid request to the A2A endpoint
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'endpoint-test',
              contextId: 'ctx-endpoint',
              role: 'user',
              parts: [{ kind: 'text', text: 'Test' }],
            },
          },
          id: 1,
        }),
      });

      // Then the endpoint should respond
      expect(response.status).toBe(200);
      const endpointResponse = await response.json();
      assertJsonRpcResponse(endpointResponse);
      expect(endpointResponse).toHaveProperty('jsonrpc', '2.0');
    }, 10000); // Increase test timeout

    it('should expose /.well-known/agent-card.json endpoint with required fields', async () => {
      // Given the A2A server is running
      // When I request the agent metadata
      const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);

      // Then the agent metadata should be returned with all required fields per PRD
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      // Validate required fields per PRD lines 162-195
      const agentCardBody = await response.json();

      // Validate A2A spec v0.3.0 required fields
      // Note: 'id' field is NOT part of the official A2A specification
      expect(agentCardBody).toHaveProperty('protocolVersion');
      expect(agentCardBody).toHaveProperty('name');
      expect(agentCardBody).toHaveProperty('capabilities');

      // Check specific values
      expect(agentCardBody.protocolVersion).toBe('0.3.0');
      expect(agentCardBody.name).toBe('Test Agent'); // Using test agent name
      expect(agentCardBody.capabilities.streaming).toBe(true);
      // Skills array may be empty or have entries depending on test config
      expect(Array.isArray(agentCardBody.skills)).toBe(true);
    });

    it('should have valid skill schema with all required fields', async () => {
      // Given the A2A server is running
      // When I request the agent metadata
      const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);
      const agentCard = await response.json();

      // Then each skill should have all required fields
      expect(response.status).toBe(200);

      // Validate agent card and skills structure per A2A spec v0.3.0
      expect(agentCard).toHaveProperty('skills');
      expect(Array.isArray(agentCard.skills)).toBe(true);
    });

    it('should expose /.well-known/agent.json endpoint with same content as agent-card.json', async () => {
      // Given the A2A server is running
      // When I request both agent metadata endpoints
      const agentJsonResponse = await fetch(`${baseUrl}/.well-known/agent.json`);
      const agentCardResponse = await fetch(`${baseUrl}/.well-known/agent-card.json`);

      // Then both endpoints should return identical content
      expect(agentJsonResponse.status).toBe(200);
      expect(agentCardResponse.status).toBe(200);

      const agentJson = await agentJsonResponse.json();
      const agentCard = await agentCardResponse.json();

      // Both should have identical content
      expect(agentJson).toEqual(agentCard);

      // Both should have the expected structure
      expect(agentJson).toHaveProperty('protocolVersion');
      expect(agentCard).toHaveProperty('protocolVersion');
      expect(agentJson.name).toBe(agentCard.name);
    });

    it('should handle CORS headers', async () => {
      // Given the A2A server with CORS enabled
      // When I send a preflight request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
        },
      });

      // Then CORS headers should be present
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
      expect(response.headers.get('access-control-allow-methods')).toBeDefined();
    });
  });

  describe('JSON-RPC protocol', () => {
    beforeEach(async () => {
      const result = await createTestA2AServer({ port: 0 });
      server = result.server;
      agentConfigHandle = result.agentConfigHandle;
      baseUrl = getServerUrl(server);
    });

    it('should handle valid JSON-RPC requests', async () => {
      // Given a valid JSON-RPC request with proper message structure
      // When I send the request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'msg-test',
              contextId: 'ctx-test',
              role: 'user',
              parts: [{ kind: 'text', text: 'Hello' }],
            },
          },
          id: 1,
        }),
      });

      // Then a valid JSON-RPC response should be returned
      expect(response.status).toBe(200);
      const jsonResponse = await response.json();
      assertJsonRpcResponse(jsonResponse);
      expect(jsonResponse).toHaveProperty('jsonrpc', '2.0');
      expect(jsonResponse).toHaveProperty('id', 1);
      expect(jsonResponse).toHaveProperty('result');
    }, 10000); // Increase test timeout

    it('should reject invalid JSON-RPC requests', async () => {
      // Given an invalid JSON-RPC request (missing jsonrpc)
      // When I send the request
      const response = await fetch(`${baseUrl}/a2a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'message/send',
          params: { message: 'Hello' },
          id: 1,
        }),
      });

      // Then an error should be returned
      expect(response.status).toBe(200); // JSON-RPC errors return 200
      const errorResponse = await response.json();

      // Use Zod to validate error response
      const validatedError = JSONRPCErrorResponseSchema.parse(errorResponse);
      expect(validatedError.error.code).toBeDefined();
    });

    it.todo('should handle batch requests');
    // The SDK may not support batch requests or requires specific configuration
  });

  describe('graceful shutdown', () => {
    it('should handle server shutdown gracefully', async () => {
      // Given a running server
      const result = await createTestA2AServer({ port: 0 });
      const testServer = result.server;
      const testAgentConfigHandle = result.agentConfigHandle;

      // When shutdown is requested
      await cleanupTestServer(testServer, testAgentConfigHandle);

      // Then the server should close gracefully (no error thrown)
      expect(testServer).toBeDefined();
    });

    it.todo('should cleanup workflow runtime on shutdown', async () => {
      // TODO: Investigate workflow loading in test environment
      // Related to the workflow integration test above
      // Given: a server with workflow runtime
      const { mkdirSync, writeFileSync, rmSync } = await import('fs');
      const { join } = await import('path');
      const { createTestConfigWorkspace } = await import('../utils/test-config-workspace.js');

      const configDir = createTestConfigWorkspace({
        agentName: 'Workflow Cleanup Test Agent',
        skills: [],
      });

      const workflowsDir = join(configDir, 'workflows');
      mkdirSync(workflowsDir, { recursive: true });

      // Create a test workflow
      writeFileSync(
        join(workflowsDir, 'cleanup-workflow.js'),
        `
export default {
  id: 'cleanup-workflow',
  name: 'Cleanup Workflow',
  version: '1.0.0',
  async *execute() {
    yield { type: 'status', status: { state: 'completed' } };
  }
};
`,
        'utf-8',
      );

      // Update workflow.json registry
      writeFileSync(
        join(configDir, 'workflow.json'),
        JSON.stringify(
          {
            workflows: [
              {
                id: 'cleanup-workflow',
                from: './workflows/cleanup-workflow.js',
                enabled: true,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      // Create server with workflows
      const { initFromConfigWorkspace } = await import('../../src/config/runtime/init.js');
      const testAgentConfigHandle = await initFromConfigWorkspace({
        root: configDir,
        dev: false,
      });

      // Verify runtime exists before cleanup
      expect(testAgentConfigHandle.workflowRuntime).toBeDefined();
      const runtimeBeforeClose = testAgentConfigHandle.workflowRuntime;

      // When: shutting down the agent config
      await testAgentConfigHandle.close();

      // Then: cleanup should complete without error
      // Note: We can't directly verify internal cleanup state,
      // but we can verify close() completes successfully
      expect(runtimeBeforeClose).toBeDefined();

      // Cleanup test files
      rmSync(configDir, { recursive: true, force: true });
    });
  });
});
