---
title: "Real-time Data Processing"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-23"]
next_lesson: "lesson-25"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["real-time","streaming","data"]
---

# **Lesson 24: Advanced Hooks and Artifacts**

---

### 🔍 Overview

**Hooks** and **artifacts** are powerful features that enhance the v2 framework beyond basic tool execution. Hooks let you add cross-cutting concerns like validation, logging, and data transformation without cluttering your core business logic. Artifacts enable rich, mixed-content responses that can include code, visualizations, and structured data.

Understanding how to leverage hooks for clean architecture and artifacts for enhanced user experiences is crucial for building sophisticated, production-ready agents.

This lesson covers advanced hook patterns and artifact creation techniques used in modern template agents.

---

### 🪝 Advanced Hook Patterns

Hooks run before or after tool execution, allowing you to enhance tools without modifying their core implementation:

```ts
// hooks/index.ts
import type { ToolContext } from 'arbitrum-vibekit-core';

export const beforeHooks = {
  toolName: async (context: ToolContext) => {
    // Runs before tool execution
    // Can modify context.input
  },
};

export const afterHooks = {
  toolName: async (context: ToolContext) => {
    // Runs after tool execution
    // Can modify context.result
  },
};
```

#### **Data Transformation Hooks**

Transform input/output data to match different interfaces:

```ts
// hooks/pricePredictionHooks.ts
export const beforeHooks = {
  getPricePrediction: async (context: ToolContext) => {
    // Transform natural language to structured input
    const { input } = context;

    // Extract token from natural language
    const tokenMatch = input.message.match(/\b(BTC|ETH|USDC|USDT)\b/i);
    if (tokenMatch) {
      context.input.token = tokenMatch[0].toUpperCase();
    }

    // Extract timeframe
    const timeframeMatch = input.message.match(/(\d+)\s*(hour|day|week)s?/i);
    if (timeframeMatch) {
      context.input.timeframe = `${timeframeMatch[1]}${timeframeMatch[2][0].toLowerCase()}`;
    }

    console.log('[Hook] Transformed input:', context.input);
  },
};

export const afterHooks = {
  getPricePrediction: async (context: ToolContext) => {
    // Enhance response with formatting and emojis
    if (context.result && typeof context.result === 'object') {
      const prediction = context.result as any;

      context.result = {
        ...prediction,
        formatted:
          `📈 **${prediction.token} Price Prediction**\n\n` +
          `🔮 Predicted Price: $${prediction.price}\n` +
          `📊 Confidence: ${prediction.confidence}%\n` +
          `⏱️ Timeframe: ${prediction.timeframe}\n` +
          `📅 Updated: ${new Date().toLocaleString()}`,
      };
    }
  },
};
```

#### **Validation and Security Hooks**

Implement validation and security checks:

```ts
// hooks/securityHooks.ts
export const beforeHooks = {
  supplyToken: async (context: ToolContext) => {
    const { walletAddress, amount, token } = context.input;

    // Validate wallet address format
    if (!isValidEthereumAddress(walletAddress)) {
      throw new VibkitError('InvalidWallet', 'Invalid Ethereum wallet address');
    }

    // Check amount limits
    if (amount <= 0) {
      throw new VibkitError('InvalidAmount', 'Amount must be positive');
    }

    if (amount > 1000000) {
      throw new VibkitError('AmountTooLarge', 'Amount exceeds maximum limit');
    }

    // Validate token is supported
    const supportedTokens = ['USDC', 'ETH', 'USDT', 'DAI'];
    if (!supportedTokens.includes(token.toUpperCase())) {
      throw new VibkitError('UnsupportedToken', `Token ${token} is not supported`);
    }

    console.log('[Security] Validation passed for supply operation');
  },

  borrowToken: async (context: ToolContext) => {
    // Additional checks for borrowing
    const { walletAddress, amount } = context.input;

    // Check user's collateral ratio
    const collateralRatio = await checkCollateralRatio(walletAddress);
    if (collateralRatio < 1.5) {
      throw new VibkitError('InsufficientCollateral', 'Insufficient collateral for borrowing');
    }

    console.log('[Security] Collateral check passed');
  },
};
```

#### **Caching and Performance Hooks**

Implement caching to improve performance:

```ts
// hooks/cachingHooks.ts
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const beforeHooks = {
  getTokenPrice: async (context: ToolContext) => {
    const cacheKey = `price_${context.input.token}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Return cached result and skip tool execution
      context.result = cached.data;
      context.skipExecution = true;
      console.log('[Cache] Using cached price data');
    }
  },
};

export const afterHooks = {
  getTokenPrice: async (context: ToolContext) => {
    // Cache successful results
    if (context.result && !context.result.error) {
      const cacheKey = `price_${context.input.token}`;
      cache.set(cacheKey, {
        data: context.result,
        timestamp: Date.now(),
      });
      console.log('[Cache] Cached price data');
    }
  },
};
```

#### **Logging and Analytics Hooks**

Track usage and performance:

```ts
// hooks/analyticsHooks.ts
export const beforeHooks = {
  // Apply to all tools using wildcard pattern
  '*': async (context: ToolContext) => {
    context.startTime = Date.now();
    console.log(`[Analytics] Tool ${context.toolName} started`, {
      input: context.input,
      timestamp: new Date().toISOString(),
    });
  },
};

export const afterHooks = {
  '*': async (context: ToolContext) => {
    const duration = Date.now() - (context.startTime || 0);
    const success = !context.result?.error;

    // Log to analytics service
    await logToolUsage({
      toolName: context.toolName,
      duration,
      success,
      inputSize: JSON.stringify(context.input).length,
      outputSize: JSON.stringify(context.result).length,
      timestamp: new Date().toISOString(),
    });

    console.log(`[Analytics] Tool ${context.toolName} completed in ${duration}ms`);
  },
};
```

---

### 🎨 Artifacts: Rich Response Content

Artifacts enable you to return rich, mixed-content responses that enhance the user experience:

```ts
import { createArtifact, createSuccessTask } from 'arbitrum-vibekit-core';

// Create an artifact with mixed content
const artifact = createArtifact(
  [
    { kind: 'text', text: 'Portfolio Analysis Results' },
    { kind: 'text', text: '\n\n**Current Holdings:**\n' },
    { kind: 'text', text: `• ETH: ${balances.ETH} ($${values.ETH})\n` },
    { kind: 'text', text: `• USDC: ${balances.USDC} ($${values.USDC})\n` },
  ],
  'Portfolio Analysis',
  'Detailed breakdown of your current portfolio',
  {
    totalValue: values.total,
    lastUpdated: new Date().toISOString(),
  }
);

return createSuccessTask('portfolio-analysis', [artifact], 'Analysis complete');
```

#### **Code Artifacts**

Return executable code or configurations:

```ts
// tools/generateSwapCode.ts
const generateSwapCodeParams = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.number(),
});

export const generateSwapCodeTool: VibkitToolDefinition<typeof generateSwapCodeParams> = {
  name: 'generateSwapCode',
  description: 'Generate TypeScript code for token swap',
  parameters: generateSwapCodeParams,
  execute: async input => {
    const swapCode = `
// Generated swap code for ${input.fromToken} → ${input.toToken}
import { ethers } from 'ethers';

async function swapTokens() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Swap ${input.amount} ${input.fromToken} for ${input.toToken}
  const swapParams = {
    fromToken: '${input.fromToken}',
    toToken: '${input.toToken}',  
    amount: ethers.parseUnits('${input.amount}', 18),
    slippage: 0.5, // 0.5%
  };
  
  console.log('Executing swap:', swapParams);
  // Implementation depends on your DEX integration
}

swapTokens().catch(console.error);
`;

    const codeArtifact = createArtifact(
      [{ kind: 'text', text: swapCode }],
      'Swap Code',
      `TypeScript code to swap ${input.amount} ${input.fromToken} for ${input.toToken}`,
      {
        language: 'typescript',
        executable: true,
        fromToken: input.fromToken,
        toToken: input.toToken,
        amount: input.amount,
      }
    );

    return createSuccessTask(
      'code-generation',
      [codeArtifact],
      `Generated swap code for ${input.fromToken} → ${input.toToken}`
    );
  },
};
```

#### **Data Visualization Artifacts**

Create charts and visualizations:

```ts
// tools/createPortfolioChart.ts
const portfolioChartParams = z.object({
  holdings: z.record(z.number()),
});

export const createPortfolioChartTool: VibkitToolDefinition<typeof portfolioChartParams> = {
  name: 'createPortfolioChart',
  description: 'Create portfolio allocation chart',
  parameters: portfolioChartParams,
  execute: async input => {
    // Generate chart data
    const chartData = {
      type: 'pie',
      data: {
        labels: Object.keys(input.holdings),
        datasets: [
          {
            data: Object.values(input.holdings),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Portfolio Allocation',
          },
        },
      },
    };

    // Create chart configuration artifact
    const chartArtifact = createArtifact(
      [
        { kind: 'text', text: '## Portfolio Allocation\n\n' },
        { kind: 'text', text: JSON.stringify(chartData, null, 2) },
      ],
      'Portfolio Chart',
      'Interactive pie chart showing portfolio allocation',
      {
        type: 'chart',
        chartType: 'pie',
        data: chartData,
      }
    );

    return createSuccessTask(
      'chart-creation',
      [chartArtifact],
      'Portfolio chart created successfully'
    );
  },
};
```

#### **Mixed Content Artifacts**

Combine text, code, and data in single responses:

````ts
// tools/analyzeLendingPosition.ts
const analyzeLendingParams = z.object({
  walletAddress: z.string(),
});

export const analyzeLendingPositionTool: VibkitToolDefinition<typeof analyzeLendingParams> = {
  name: 'analyzeLendingPosition',
  description: 'Analyze lending position for a wallet',
  parameters: analyzeLendingParams,
  execute: async input => {
    const position = await getLendingPosition(input.walletAddress);

    // Create comprehensive analysis artifact
    const analysisArtifact = createArtifact(
      [
        { kind: 'text', text: '# Lending Position Analysis\n\n' },
        { kind: 'text', text: `**Wallet:** \`${input.walletAddress}\`\n` },
        { kind: 'text', text: `**Total Supplied:** $${position.totalSupplied.toLocaleString()}\n` },
        { kind: 'text', text: `**Total Borrowed:** $${position.totalBorrowed.toLocaleString()}\n` },
        { kind: 'text', text: `**Health Factor:** ${position.healthFactor}\n\n` },

        { kind: 'text', text: '## Risk Assessment\n\n' },
        { kind: 'text', text: position.healthFactor > 2.0 ? '✅ Low Risk' : '⚠️ Medium Risk' },
        { kind: 'text', text: '\n\n## Recommendations\n\n' },

        ...position.recommendations.map(rec => ({
          kind: 'text' as const,
          text: `• ${rec}\n`,
        })),

        { kind: 'text', text: '\n\n## Position Details\n\n```json\n' },
        { kind: 'text', text: JSON.stringify(position, null, 2) },
        { kind: 'text', text: '\n```' },
      ],
      'Lending Analysis',
      'Comprehensive analysis of your lending position',
      {
        walletAddress: input.walletAddress,
        healthFactor: position.healthFactor,
        riskLevel: position.healthFactor > 2.0 ? 'low' : 'medium',
        totalValue: position.totalSupplied,
        generatedAt: new Date().toISOString(),
      }
    );

    return createSuccessTask(
      'lending-analysis',
      [analysisArtifact],
      'Lending position analysis completed'
    );
  },
};
````

---

### 🔧 Hook Integration with Skills

Hooks are automatically applied when tools are used within skills:

```ts
// skills/enhancedLending.ts
export const enhancedLendingSkill = defineSkill({
  id: 'enhanced-lending',
  name: 'Enhanced Lending',
  description: 'Lending operations with security, caching, and analytics',

  tools: [
    supplyTool, // Will use security + analytics hooks
    borrowTool, // Will use security + analytics hooks
    withdrawTool, // Will use security + analytics hooks
  ],

  // Hooks are applied automatically based on tool names
});
```

#### **Conditional Hook Application**

Apply hooks based on context or configuration:

```ts
// hooks/conditionalHooks.ts
export const beforeHooks = {
  supplyToken: async (context: ToolContext) => {
    // Only apply validation in production
    if (process.env.NODE_ENV === 'production') {
      await validateProductionSafety(context.input);
    }

    // Only cache in development for testing
    if (process.env.NODE_ENV === 'development') {
      await applyCaching(context);
    }

    // Always log in staging
    if (process.env.NODE_ENV === 'staging') {
      await logDetailedAnalytics(context);
    }
  },
};
```

#### **Hook Composition**

Combine multiple hook functions:

```ts
// hooks/composedHooks.ts
import { securityHooks } from './securityHooks.js';
import { analyticsHooks } from './analyticsHooks.js';
import { cachingHooks } from './cachingHooks.js';

// Compose multiple hook modules
export const beforeHooks = {
  ...securityHooks.beforeHooks,
  ...analyticsHooks.beforeHooks,
  ...cachingHooks.beforeHooks,

  // Custom composition for specific tools
  supplyToken: async (context: ToolContext) => {
    await securityHooks.beforeHooks.supplyToken?.(context);
    await analyticsHooks.beforeHooks['*']?.(context);
    await cachingHooks.beforeHooks.supplyToken?.(context);
  },
};
```

---

### 🎯 Best Practices

#### **Hook Design Principles**

1. **Single Responsibility**: Each hook should have one clear purpose
2. **Non-Invasive**: Don't modify core business logic
3. **Error Handling**: Hooks should fail gracefully
4. **Performance**: Keep hooks lightweight
5. **Composability**: Design hooks to work together

#### **Artifact Design Principles**

1. **Rich Content**: Use mixed content types for better UX
2. **Metadata**: Include useful metadata for processing
3. **Structure**: Organize content logically
4. **Accessibility**: Ensure content is readable and usable
5. **Context**: Provide relevant context and timestamps

#### **Testing Hooks and Artifacts**

```ts
// test/hooks.test.ts
import { beforeHooks, afterHooks } from '../src/hooks/index.js';

describe('Price Prediction Hooks', () => {
  it('should transform natural language input', async () => {
    const context = {
      input: { message: 'What will BTC price be in 24 hours?' },
      toolName: 'getPricePrediction',
    };

    await beforeHooks.getPricePrediction(context);

    expect(context.input.token).toBe('BTC');
    expect(context.input.timeframe).toBe('24h');
  });

  it('should format response with emojis', async () => {
    const context = {
      result: { token: 'ETH', price: 3000, confidence: 85 },
      toolName: 'getPricePrediction',
    };

    await afterHooks.getPricePrediction(context);

    expect(context.result.formatted).toContain('📈');
    expect(context.result.formatted).toContain('ETH');
  });
});
```

---

### ✅ Summary

Advanced hooks and artifacts enhance the v2 framework:

- **Hooks** provide clean separation of concerns for cross-cutting functionality
- **Data transformation** hooks adapt interfaces without changing core logic
- **Security hooks** implement validation and safety checks
- **Analytics hooks** track usage and performance metrics
- **Artifacts** enable rich, mixed-content responses
- **Code artifacts** return executable code and configurations
- **Visualization artifacts** create charts and interactive content

Use hooks to keep your tools focused on business logic while adding essential capabilities like security, caching, and analytics. Use artifacts to create engaging, informative responses that go beyond simple text.

> "Hooks are the seasoning. Artifacts are the presentation."

| Feature             | Purpose                 | Benefits                   | Use Cases                         |
| ------------------- | ----------------------- | -------------------------- | --------------------------------- |
| **Before Hooks**    | Pre-processing          | Validation, transformation | Security checks, input formatting |
| **After Hooks**     | Post-processing         | Enhancement, logging       | Response formatting, analytics    |
| **Text Artifacts**  | Rich content            | Better UX                  | Analysis reports, documentation   |
| **Code Artifacts**  | Executable content      | Developer tools            | Generated scripts, configurations |
| **Mixed Artifacts** | Comprehensive responses | Complete information       | Analysis + recommendations + data |
