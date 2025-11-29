import type { Page } from '@playwright/test';

// Test data generators
export const TestDataGenerator = {
  generatePriceData: (
    numPoints: number,
    basePrice = 40000,
    variance = 5000,
  ) => {
    const now = Date.now();
    return {
      prices: Array.from({ length: numPoints }, (_, i) => [
        now - (numPoints - 1 - i) * 86400000, // Daily intervals going back
        basePrice + (Math.random() - 0.5) * variance, // Random price with variance
      ]) as [number, number][],
    };
  },

  generateEmptyData: () => ({ prices: [] }),

  generateSinglePoint: (timestamp = Date.now(), price = 42000) => ({
    prices: [[timestamp, price]] as [number, number][],
  }),

  generateExtremeData: () => ({
    prices: [
      [Date.now() - 172800000, 0.000001], // Very small value
      [Date.now() - 86400000, 1000000], // Very large value
      [Date.now(), 50000], // Normal value
    ] as [number, number][],
  }),

  generateLargeDataset: (size = 1000) => {
    const now = Date.now();
    return {
      prices: Array.from({ length: size }, (_, i) => [
        now - (size - 1 - i) * 3600000, // Hourly data
        40000 + Math.sin(i / 10) * 5000 + Math.random() * 1000,
      ]) as [number, number][],
    };
  },
};

// Common test patterns
export const TestPatterns = {
  // Test API response mocking
  mockCoinGeckoAPI: async (
    page: Page,
    responseData: any,
    options: { shouldFail?: boolean; status?: number; delay?: number } = {},
  ) => {
    const {
      shouldFail = false,
      status = shouldFail ? 500 : 200,
      delay = 0,
    } = options;

    await page.route(
      '**/api.coingecko.com/api/v3/coins/*/market_chart*',
      async (route) => {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (shouldFail) {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'API Error' }),
          });
        } else {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(responseData),
          });
        }
      },
    );
  },

  // Test chart generation via chat
  triggerChartGeneration: async (page: Page, token: string, days: number) => {
    const message = `Generate a price chart for ${token} over ${days} days`;
    await page.fill('[data-testid="chat-input"]', message);
    await page.press('[data-testid="chat-input"]', 'Enter');
  },

  // Wait for chart to appear
  waitForChart: async (page: Page, timeout = 10000) => {
    await page.waitForSelector('[data-testid="price-chart"]', { timeout });
  },

  // Verify chart structure
  verifyChartStructure: async (page: Page) => {
    const chart = page.locator('[data-testid="price-chart"]');
    const svg = chart.locator('svg');

    return {
      chartExists: await chart.isVisible(),
      svgExists: await svg.isVisible(),
      hasPath: (await svg.locator('path').count()) > 0,
      hasDataPoints: (await svg.locator('circle').count()) > 0,
    };
  },
};

// Performance measurement helpers
export const PerformanceHelpers = {
  measureRenderTime: async (page: Page, action: () => Promise<void>) => {
    const startTime = Date.now();
    await action();
    const endTime = Date.now();
    return endTime - startTime;
  },

  measureMemoryUsage: async (page: Page) => {
    const memoryInfo = await page.evaluate(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        return {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        };
      }
      return null;
    });
    return memoryInfo;
  },

  checkForMemoryLeaks: async (page: Page, iterations = 5) => {
    const measurements = [];

    for (let i = 0; i < iterations; i++) {
      // Force garbage collection if available
      await page.evaluate(() => {
        if ('gc' in window) {
          (window as any).gc();
        }
      });

      const memory = await PerformanceHelpers.measureMemoryUsage(page);
      if (memory) {
        measurements.push(memory.usedJSHeapSize);
      }

      await page.waitForTimeout(100);
    }

    // Check if memory usage keeps increasing
    const isIncreasing =
      measurements.length > 2 &&
      measurements
        .slice(-3)
        .every((val, i, arr) => i === 0 || val > arr[i - 1]);

    return {
      measurements,
      potentialLeak: isIncreasing,
      finalMemory: measurements[measurements.length - 1],
    };
  },
};

// Visual regression helpers
export const VisualHelpers = {
  captureChartScreenshot: async (page: Page, name: string) => {
    const chart = page.locator('[data-testid="price-chart"]');
    await chart.screenshot({ path: `screenshots/chart-${name}.png` });
  },

  compareChartVisuals: async (
    page: Page,
    baselineName: string,
    currentName: string,
  ) => {
    // This would integrate with visual regression testing tools
    // For now, just capture both screenshots
    await VisualHelpers.captureChartScreenshot(page, baselineName);
    await VisualHelpers.captureChartScreenshot(page, currentName);
  },
};

// Error handling test helpers
export const ErrorHelpers = {
  expectErrorMessage: async (
    page: Page,
    expectedError: string,
    timeout = 5000,
  ) => {
    const errorLocator = page.locator(`text=${expectedError}`);
    await errorLocator.waitFor({ timeout });
    return errorLocator.isVisible();
  },

  triggerNetworkError: async (page: Page) => {
    // Simulate network offline
    await page.context().setOffline(true);
  },

  restoreNetwork: async (page: Page) => {
    await page.context().setOffline(false);
  },

  simulateSlowNetwork: async (page: Page) => {
    // Simulate slow network conditions
    await page.route('**/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay
      await route.continue();
    });
  },
};

// Data validation helpers
export const DataValidationHelpers = {
  validatePriceDataStructure: (data: any) => {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.prices)) return false;

    return data.prices.every(
      (price: any) =>
        Array.isArray(price) &&
        price.length === 2 &&
        typeof price[0] === 'number' && // timestamp
        typeof price[1] === 'number', // price
    );
  },

  validateChartDimensions: (width: number, height: number) => {
    return width > 0 && height > 0 && width <= 2000 && height <= 2000;
  },

  sanitizePriceData: (data: any) => {
    if (!DataValidationHelpers.validatePriceDataStructure(data)) {
      return { prices: [] };
    }

    // Remove any invalid data points
    const validPrices = data.prices.filter(
      (price: [number, number]) =>
        !Number.isNaN(price[0]) && !Number.isNaN(price[1]) && Number.isFinite(price[1]),
    );

    return { prices: validPrices };
  },
};

export default {
  TestDataGenerator,
  TestPatterns,
  PerformanceHelpers,
  VisualHelpers,
  ErrorHelpers,
  DataValidationHelpers,
};
