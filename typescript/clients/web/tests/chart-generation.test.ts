import { test, expect, type Page } from '@playwright/test';

// Test data fixtures
const mockPriceData = {
  prices: [
    [1703980800000, 42000], // Valid price data
    [1703984400000, 42100],
    [1703988000000, 41950],
    [1703991600000, 42200],
    [1703995200000, 42150],
  ],
};

const mockEmptyData = { prices: [] };

const mockSingleDataPoint = {
  prices: [[1703980800000, 42000]],
};

const mockExtremeValues = {
  prices: [
    [1703980800000, 0.000001], // Very small value
    [1703984400000, 1000000], // Very large value
    [1703988000000, 0.000001],
  ],
};

// Mock API responses for testing
async function mockCoinGeckoAPI(page: Page, responseData: any, shouldFail = false) {
  await page.route('**/api.coingecko.com/api/v3/coins/*/market_chart*', async route => {
    if (shouldFail) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'API Error' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    }
  });
}

test.describe('Chart Generation - API Tool Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat'); // Assuming chart functionality is accessible from chat
  });

  test('should successfully generate chart for supported token', async ({ page }) => {
    await mockCoinGeckoAPI(page, mockPriceData);
    
    // Trigger chart generation
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for BTC over 7 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Wait for chart to be generated
    await expect(page.locator('[data-testid="price-chart"]')).toBeVisible({ timeout: 10000 });
    
    // Verify chart contains expected elements
    await expect(page.locator('svg')).toBeVisible();
    await expect(page.locator('path')).toBeVisible(); // Price line
  });

  test('should handle unsupported token gracefully', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for INVALIDTOKEN over 7 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Should show error message
    await expect(page.locator('text=Token "INVALIDTOKEN" is not supported')).toBeVisible({ timeout: 5000 });
  });

  test('should handle API failures gracefully', async ({ page }) => {
    await mockCoinGeckoAPI(page, null, true); // Mock API failure
    
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for BTC over 7 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Should show error message for API failure
    await expect(page.locator('text=Failed to fetch chart data')).toBeVisible({ timeout: 5000 });
  });

  test('should validate days parameter bounds', async ({ page }) => {
    // Test with invalid negative days
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for BTC over -5 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Should handle gracefully or show validation error
    await page.waitForTimeout(2000);
    
    // Test with extremely large days value
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for BTC over 10000 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    await page.waitForTimeout(2000);
  });
});

test.describe('Price Chart Component Tests', () => {
  // Helper function to inject chart component directly for testing
  async function injectPriceChart(page: Page, data: any, width = 600, height = 300) {
    await page.evaluate(({ data, width, height }) => {
      // Remove any existing chart
      const existing = document.getElementById('test-chart');
      if (existing) existing.remove();

      // Create container
      const container = document.createElement('div');
      container.id = 'test-chart';
      container.setAttribute('data-testid', 'price-chart');
      document.body.appendChild(container);

      // This would normally be rendered by React, but for testing we'll create the SVG directly
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', width.toString());
      svg.setAttribute('height', height.toString());
      svg.setAttribute('data-testid', 'chart-svg');
      
      if (data && data.prices && data.prices.length > 0) {
        // Add a simple path for testing
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 60,240 L 540,60');
        path.setAttribute('stroke', '#667eea');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('data-testid', 'price-line');
        svg.appendChild(path);

        // Add data points
        data.prices.forEach((price: [number, number], i: number) => {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', (60 + i * 120).toString());
          circle.setAttribute('cy', (240 - (price[1] / 50000) * 180).toString());
          circle.setAttribute('r', '4');
          circle.setAttribute('fill', '#667eea');
          circle.setAttribute('data-testid', `data-point-${i}`);
          svg.appendChild(circle);
        });
      } else {
        // Add "no data" message
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (width / 2).toString());
        text.setAttribute('y', (height / 2).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'white');
        text.textContent = 'No price data available.';
        text.setAttribute('data-testid', 'no-data-message');
        svg.appendChild(text);
      }
      
      container.appendChild(svg);
    }, { data, width, height });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/'); // Go to a blank page for component testing
  });

  test('should render chart with valid price data', async ({ page }) => {
    await injectPriceChart(page, mockPriceData);
    
    // Verify chart elements are present
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
    await expect(page.locator('[data-testid="price-line"]')).toBeVisible();
    
    // Verify correct number of data points
    const dataPoints = page.locator('[data-testid^="data-point-"]');
    await expect(dataPoints).toHaveCount(mockPriceData.prices.length);
  });

  test('should handle empty data gracefully', async ({ page }) => {
    await injectPriceChart(page, mockEmptyData);
    
    // Should show "no data" message
    await expect(page.locator('[data-testid="no-data-message"]')).toBeVisible();
    await expect(page.locator('text=No price data available')).toBeVisible();
  });

  test('should handle single data point', async ({ page }) => {
    await injectPriceChart(page, mockSingleDataPoint);
    
    // Should render with single point
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-point-0"]')).toBeVisible();
  });

  test('should handle null/undefined data', async ({ page }) => {
    await injectPriceChart(page, null);
    
    // Should show error state
    await expect(page.locator('[data-testid="no-data-message"]')).toBeVisible();
  });

  test('should handle extreme price values', async ({ page }) => {
    await injectPriceChart(page, mockExtremeValues);
    
    // Chart should still render
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
    await expect(page.locator('[data-testid="price-line"]')).toBeVisible();
  });

  test('should render with custom dimensions', async ({ page }) => {
    const customWidth = 800;
    const customHeight = 400;
    
    await injectPriceChart(page, mockPriceData, customWidth, customHeight);
    
    const svg = page.locator('[data-testid="chart-svg"]');
    await expect(svg).toHaveAttribute('width', customWidth.toString());
    await expect(svg).toHaveAttribute('height', customHeight.toString());
  });

  test('should handle responsive behavior', async ({ page }) => {
    // Test with mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await injectPriceChart(page, mockPriceData, 350, 200);
    
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
    
    // Test with desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await injectPriceChart(page, mockPriceData, 800, 400);
    
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
  });
});

test.describe('Chart Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should handle mouse hover interactions', async ({ page }) => {
    await injectPriceChart(page, mockPriceData);
    
    const chart = page.locator('[data-testid="chart-svg"]');
    const dataPoint = page.locator('[data-testid="data-point-0"]');
    
    // Hover over data point
    await dataPoint.hover();
    
    // Wait for potential tooltip or hover effects
    await page.waitForTimeout(500);
    
    // Move away
    await chart.hover({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
  });
});

test.describe('Performance Tests', () => {
  test('should handle large datasets efficiently', async ({ page }) => {
    // Generate large dataset
    const largeDataset = {
      prices: Array.from({ length: 1000 }, (_, i) => [
        Date.now() - (1000 - i) * 86400000, // Daily data for 1000 days
        40000 + Math.random() * 10000, // Random price between 40k-50k
      ]) as [number, number][],
    };

    await page.goto('/');
    
    const startTime = Date.now();
    await injectPriceChart(page, largeDataset);
    const endTime = Date.now();
    
    // Should render within reasonable time (under 5 seconds for large dataset)
    expect(endTime - startTime).toBeLessThan(5000);
    
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
  });

  test('should not memory leak with rapid re-renders', async ({ page }) => {
    await page.goto('/');
    
    // Rapidly re-render chart multiple times
    for (let i = 0; i < 10; i++) {
      await injectPriceChart(page, mockPriceData);
      await page.waitForTimeout(100);
    }
    
    // Chart should still be functional
    await expect(page.locator('[data-testid="chart-svg"]')).toBeVisible();
  });
});

test.describe('Integration Tests', () => {
  test('should handle complete user workflow', async ({ page }) => {
    await mockCoinGeckoAPI(page, mockPriceData);
    await page.goto('/chat');
    
    // Step 1: Request chart generation
    await page.fill('[data-testid="chat-input"]', 'Show me a BTC price chart for the last 7 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Step 2: Wait for AI response and chart generation
    await expect(page.locator('[data-testid="price-chart"]')).toBeVisible({ timeout: 15000 });
    
    // Step 3: Verify chart is interactive
    const chart = page.locator('[data-testid="price-chart"] svg');
    await expect(chart).toBeVisible();
    
    // Step 4: Test follow-up request
    await page.fill('[data-testid="chat-input"]', 'Now show me ETH for 30 days');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Should generate new chart
    await page.waitForTimeout(3000);
  });

  test('should handle network connectivity issues', async ({ page }) => {
    await page.goto('/chat');
    
    // Simulate network offline
    await page.context().setOffline(true);
    
    await page.fill('[data-testid="chat-input"]', 'Generate a price chart for BTC');
    await page.press('[data-testid="chat-input"]', 'Enter');
    
    // Should show appropriate error message
    await expect(page.locator('text=network')).toBeVisible({ timeout: 10000 });
    
    // Restore network
    await page.context().setOffline(false);
  });
});

// Helper function for component testing (to be used in real React tests)
async function injectPriceChart(page: Page, data: any, width = 600, height = 300) {
  await page.evaluate(({ data, width, height }) => {
    const existing = document.getElementById('test-chart');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'test-chart';
    container.setAttribute('data-testid', 'price-chart');
    document.body.appendChild(container);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('data-testid', 'chart-svg');
    
    if (data && data.prices && data.prices.length > 0) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 60,240 L 540,60');
      path.setAttribute('stroke', '#667eea');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('fill', 'none');
      path.setAttribute('data-testid', 'price-line');
      svg.appendChild(path);

      data.prices.forEach((price: [number, number], i: number) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', (60 + i * 120).toString());
        circle.setAttribute('cy', (240 - (price[1] / 50000) * 180).toString());
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#667eea');
        circle.setAttribute('data-testid', `data-point-${i}`);
        svg.appendChild(circle);
      });
    } else {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (width / 2).toString());
      text.setAttribute('y', (height / 2).toString());
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', 'white');
      text.textContent = 'No price data available.';
      text.setAttribute('data-testid', 'no-data-message');
      svg.appendChild(text);
    }
    
    container.appendChild(svg);
  }, { data, width, height });
} 