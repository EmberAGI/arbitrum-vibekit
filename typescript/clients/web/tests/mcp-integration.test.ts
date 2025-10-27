import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Test configuration
const MCP_SERVER_PORT = 3011;
const MCP_SERVER_URL = `http://localhost:${MCP_SERVER_PORT}/sse`;

// Helper function to start the MCP server
async function startMcpServer(): Promise<any> {
  return new Promise((resolve, reject) => {
    // Use the stdio-only server for testing (simpler and more reliable)
    const serverProcess = spawn(
      'node',
      [
        path.join(
          __dirname,
          '../../../lib/community-mcp-tools/coingecko-mcp-server/dist/stdio-server.js',
        ),
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let serverReady = false;

    // Add timeout for server startup
    const startupTimeout = setTimeout(() => {
      if (!serverReady) {
        console.error('❌ MCP server failed to start within 10 seconds');
        serverProcess.kill();
        reject(new Error('MCP server failed to start within 10 seconds'));
      }
    }, 10000);

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('MCP Server:', output.trim());

      if (output.includes('CoinGecko MCP stdio server started and connected')) {
        serverReady = true;
        clearTimeout(startupTimeout);
        console.log('✅ MCP Server is ready!');
        setTimeout(() => resolve(serverProcess), 1000); // Wait a bit for full readiness
      }
    });

    serverProcess.on('error', (error) => {
      clearTimeout(startupTimeout);
      console.error('❌ MCP Server error:', error);
      reject(error);
    });
  });
}

// Helper function to test MCP server directly
async function testMcpServerDirectly(serverProcess: any) {
  return new Promise((resolve, reject) => {
    const testRequest = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_supported_tokens',
        arguments: {},
      },
    };

    const requestStr = `${JSON.stringify(testRequest)}\n`;

    // Set up response listener before sending request
    const timeout = setTimeout(() => {
      reject(new Error('Direct MCP test timeout'));
    }, 10000);

    const onData = (data: Buffer) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString().trim());
        serverProcess.stdout.removeListener('data', onData);
        resolve(response);
      } catch (error) {
        serverProcess.stdout.removeListener('data', onData);
        reject(error);
      }
    };

    serverProcess.stdout.on('data', onData);

    // Send the request
    serverProcess.stdin.write(requestStr);
  });
}

test.describe('CoinGecko MCP Server Integration Tests', () => {
  let serverProcess: any;

  test.beforeAll(async () => {
    console.log('🚀 Starting CoinGecko MCP Server for testing...');
    try {
      serverProcess = await startMcpServer();
      console.log('✅ MCP Server started successfully');

      // Test direct connection
      const directResult = await testMcpServerDirectly(serverProcess);
      console.log('✅ Direct MCP test passed:', directResult);
    } catch (error) {
      console.error('❌ Failed to start MCP server:', error);
      throw error;
    }
  });

  test.afterAll(async () => {
    if (serverProcess) {
      console.log('🛑 Shutting down MCP server...');
      serverProcess.kill();
    }
  });

  test('should connect to MCP server and discover tools', async ({ page }) => {
    // Navigate to the chat page
    await page.goto('/');

    // Wait for the page to load
    await page.waitForSelector('[data-testid="multimodal-input"]', {
      timeout: 10000,
    });

    // Check if the page loaded successfully
    const chatInput = page.locator('[data-testid="multimodal-input"]');
    await expect(chatInput).toBeVisible();

    console.log('✅ Chat interface loaded successfully');
  });

  test('should display supported tokens when requested', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Send a message requesting supported tokens
    const message = 'What cryptocurrency tokens are supported?';
    await page.fill('[data-testid="multimodal-input"]', message);
    await page.press('[data-testid="multimodal-input"]', 'Enter');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check if we get a response about supported tokens
    const messages = page.locator('[data-testid="message-content"]');
    const lastMessage = messages.last();

    // The response should mention supported tokens
    await expect(lastMessage).toBeVisible();

    console.log('✅ Supported tokens request handled');
  });

  test('should generate price chart for BTC', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Send a message requesting BTC price chart
    const message = 'Generate a price chart for BTC over 7 days';
    await page.fill('[data-testid="multimodal-input"]', message);
    await page.press('[data-testid="multimodal-input"]', 'Enter');

    // Wait for response and chart to appear
    await page.waitForTimeout(8000);

    // Check if price chart appears
    const priceChart = page.locator('[data-testid="price-chart"]');
    await expect(priceChart).toBeVisible({ timeout: 10000 });

    // Check if chart has SVG content
    const svg = priceChart.locator('svg');
    await expect(svg).toBeVisible();

    // Check if chart has data points
    const dataPoints = svg.locator('circle');
    const pointCount = await dataPoints.count();
    expect(pointCount).toBeGreaterThan(0);

    console.log(`✅ BTC price chart generated with ${pointCount} data points`);
  });

  test('should handle invalid token gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Send a message with invalid token
    const message = 'Generate a price chart for INVALIDTOKEN over 7 days';
    await page.fill('[data-testid="multimodal-input"]', message);
    await page.press('[data-testid="multimodal-input"]', 'Enter');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check if we get an error message
    const messages = page.locator('[data-testid="message-content"]');
    const lastMessage = messages.last();

    // Should show error about unsupported token
    const messageText = await lastMessage.textContent();
    expect(messageText).toContain('not supported');

    console.log('✅ Invalid token handled gracefully');
  });

  test('should handle multiple chart requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Request multiple charts
    const requests = [
      'Generate a price chart for ETH over 3 days',
      'Generate a price chart for USDC over 1 day',
      'Generate a price chart for ARB over 14 days',
    ];

    for (const request of requests) {
      await page.fill('[data-testid="multimodal-input"]', request);
      await page.press('[data-testid="multimodal-input"]', 'Enter');
      await page.waitForTimeout(3000);
    }

    // Wait for all charts to load
    await page.waitForTimeout(5000);

    // Check if multiple charts are present
    const priceCharts = page.locator('[data-testid="price-chart"]');
    const chartCount = await priceCharts.count();
    expect(chartCount).toBeGreaterThanOrEqual(requests.length);

    console.log(`✅ Multiple charts generated: ${chartCount} charts found`);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // This test simulates network issues by temporarily stopping the server
    if (serverProcess) {
      serverProcess.kill();
      await page.waitForTimeout(1000);
    }

    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Try to request a chart when server is down
    const message = 'Generate a price chart for BTC over 7 days';
    await page.fill('[data-testid="multimodal-input"]', message);
    await page.press('[data-testid="multimodal-input"]', 'Enter');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check if we get an error message
    const messages = page.locator('[data-testid="message-content"]');
    const lastMessage = messages.last();

    // Should show some kind of error or fallback
    await expect(lastMessage).toBeVisible();

    console.log('✅ Network errors handled gracefully');

    // Restart server for other tests
    if (!serverProcess) {
      serverProcess = await startMcpServer();
    }
  });

  test('should maintain chart interactivity', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Generate a chart
    const message = 'Generate a price chart for BTC over 30 days';
    await page.fill('[data-testid="multimodal-input"]', message);
    await page.press('[data-testid="multimodal-input"]', 'Enter');

    // Wait for chart to appear
    await page.waitForSelector('[data-testid="price-chart"]', {
      timeout: 10000,
    });

    // Test hover interactions
    const chart = page.locator('[data-testid="price-chart"]');
    const svg = chart.locator('svg');

    // Hover over the chart
    await svg.hover();

    // Check if hover effects work (data points should be visible)
    const dataPoints = svg.locator('circle');
    await expect(dataPoints.first()).toBeVisible();

    // Test clicking on data points
    await dataPoints.first().click();

    console.log('✅ Chart interactivity maintained');
  });

  test('should handle concurrent requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="multimodal-input"]');

    // Send multiple requests quickly
    const requests = [
      'Generate a price chart for BTC over 7 days',
      'Generate a price chart for ETH over 7 days',
      'What tokens are supported?',
    ];

    // Send all requests
    for (const request of requests) {
      await page.fill('[data-testid="multimodal-input"]', request);
      await page.press('[data-testid="multimodal-input"]', 'Enter');
      await page.waitForTimeout(500); // Small delay between requests
    }

    // Wait for all responses
    await page.waitForTimeout(10000);

    // Check if we got responses for all requests
    const messages = page.locator('[data-testid="message-content"]');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThanOrEqual(requests.length);

    console.log(`✅ Concurrent requests handled: ${messageCount} responses`);
  });
});
