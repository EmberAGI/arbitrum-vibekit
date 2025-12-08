# Custom Tool Components Documentation

A comprehensive guide for implementing custom React components for specific MCP tool responses in the Ember A2A system.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Overview](#overview)
3. [Architecture](#architecture)
4. [App Workflow](#app-workflow)
5. [Creating Custom Components](#creating-custom-components)
6. [Configuration](#configuration)
7. [Component Interface](#component-interface)
8. [Data Transformation](#data-transformation)
9. [Examples](#examples)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 5-Minute Setup

Want to create a custom component quickly? Follow these steps:

1. **Copy the template** from `src/components/tools/ComponentTemplate.tsx` (created below)
2. **Rename and customize** the component for your tool
3. **Register the component** in `src/lib/toolComponentLoader.ts`
4. **Configure the tool mapping** in `src/config/tools.ts`
5. **Test with your MCP tool**

### Example: Creating a "TokenPrice" Component

```bash
# 1. Create component file
cp src/components/tools/ComponentTemplate.tsx src/components/tools/TokenPrice.tsx

# 2. Edit the component (replace MyTool with TokenPrice, customize UI)
# 3. Add to toolComponentLoader.ts
# 4. Add configuration to tools.ts with id matching your MCP tool
# 5. Test!
```

### Minimal Example

```typescript
// src/components/tools/TokenPrice.tsx
"use client";
export function TokenPrice({ data }: { data: any }) {
  return (
    <div className="p-4 bg-blue-50 rounded-lg">
      <h3 className="font-bold">{data.token} Price</h3>
      <p className="text-2xl">${data.price}</p>
    </div>
  );
}
```

```typescript
// Add to toolComponentLoader.ts
TokenPrice: lazy(() =>
  import("@/components/tools/TokenPrice").then((m) => ({ default: m.TokenPrice }))
),
```

```typescript
// Add to tools.ts
{
  id: "getTokenPrice",  // Must match your MCP tool name
  name: "Token Price",
  description: "Display token price information",
  category: "market-data",
  component: "TokenPrice",
  enabled: true,
},
```

---

## Overview

The Ember A2A system supports custom React components to render specific MCP tool responses with rich, interactive UIs instead of plain JSON. This allows for:

- **Enhanced User Experience**: Interactive elements like transaction buttons, forms, and visualizations
- **Tool-Specific Features**: Custom logic tailored to each tool's functionality
- **Rich Data Display**: Formatted layouts, charts, and structured presentations
- **Action Integration**: Direct wallet interactions, transaction signing, and state management

### Key Features

- Dynamic component loading with React.lazy()
- Automatic fallback to JsonViewer for unhandled tools
- UI/JSON view toggle for debugging
- Error boundaries and loading states
- Type-safe component configuration

---

## Architecture

The custom component system consists of several interconnected parts:

### Core Components

```
src/
├── components/
│   ├── ToolResultRenderer.tsx    # Main orchestrator
│   └── tools/                    # Custom tool components
│       ├── Swaps.tsx            # Example: Token swap UI
│       └── JsonViewer.tsx       # Default fallback component
├── config/
│   └── tools.ts                 # Tool configuration mapping
└── lib/
    └── toolComponentLoader.ts   # Dynamic component loader
```

### Component Flow

1. **MCP Tool Execution** → Tool returns JSON result
2. **ToolResultRenderer** → Checks configuration for custom component
3. **Component Loader** → Dynamically imports the component
4. **Data Transformation** → Converts MCP data to component props
5. **Render** → Displays custom UI or falls back to JsonViewer

---

## App Workflow

### 1. User Interaction

- User sends a message to the AI agent
- AI determines which MCP tool to call (e.g., `createSwap`)
- Tool parameters are extracted from the user's request

### 2. MCP Tool Execution

- MCP server receives tool call with parameters
- Server processes the request and returns structured JSON data
- Response includes transaction plans, token info, pricing, etc.

### 3. Component Resolution

```typescript
// ToolResultRenderer.tsx
const toolConfig = getToolConfig(toolName); // Get tool configuration
const componentName = toolConfig?.component || 'JsonViewer'; // Default fallback
const ToolComponent = getToolComponent(componentName); // Dynamic import
```

### 4. Data Transformation (Optional)

```typescript
// Transform raw MCP data into component-friendly format
if (toolName === 'createSwap' && componentName === 'Swaps') {
  const transformedData = transformCreateSwapResponse(result);
  componentProps = transformedData;
}
```

### 5. Component Rendering

- Custom component renders with transformed data
- User can toggle between custom UI and raw JSON view
- Interactive elements (buttons, forms) handle user actions
- Error boundaries provide graceful failure handling

### 6. User Actions

- Custom components can trigger wallet connections
- Transaction signing and execution
- State updates and real-time feedback
- Navigation to external resources

---

## Creating Custom Components

### Step 1: Create the Component File

Create a new React component in `src/components/tools/`:

```typescript
// src/components/tools/MyCustomTool.tsx
"use client";

import React from "react";

interface MyCustomToolProps {
  // Define your props based on the MCP tool response structure
  toolData: any; // Replace 'any' with specific types
  // Add other props as needed
}

export function MyCustomTool({ toolData }: MyCustomToolProps) {
  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Custom Tool Results</h2>

      {/* Your custom UI implementation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Example: Display structured data */}
        <div className="bg-white p-3 rounded border">
          <h3 className="font-semibold">Tool Output</h3>
          <pre className="text-sm text-gray-600">
            {JSON.stringify(toolData, null, 2)}
          </pre>
        </div>

        {/* Example: Interactive elements */}
        <div className="bg-white p-3 rounded border">
          <h3 className="font-semibold">Actions</h3>
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            onClick={() => {
              // Handle custom actions
              console.log("Custom action triggered");
            }}
          >
            Execute Action
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Register Component in Loader

Add your component to `src/lib/toolComponentLoader.ts`:

```typescript
import { lazy } from 'react';

const toolComponents = {
  Swaps: lazy(() => import('@/components/tools/Swaps').then((m) => ({ default: m.Swaps }))),
  JsonViewer: lazy(() =>
    import('@/components/tools/JsonViewer').then((m) => ({
      default: m.JsonViewer,
    })),
  ),
  // Add your new component
  MyCustomTool: lazy(() =>
    import('@/components/tools/MyCustomTool').then((m) => ({
      default: m.MyCustomTool,
    })),
  ),
};
```

### Step 3: Configure Tool Mapping

Update `src/config/tools.ts` to map your MCP tool to the component:

```typescript
export const toolConfigs: ToolConfig[] = [
  // Existing configurations...
  {
    id: 'myToolId', // Must match MCP tool name exactly
    name: 'My Custom Tool',
    description: 'Description of what this tool does for users',
    category: 'custom', // Use existing category or add new one
    component: 'MyCustomTool', // Component name from toolComponentLoader
    enabled: true,
  },
];
```

### Step 4: Add Category (if needed)

If using a new category, add it to `toolCategories`:

```typescript
export const toolCategories: ToolCategory[] = [
  // Existing categories...
  {
    id: 'custom',
    name: 'Custom Tools',
    description: 'Custom tool implementations',
    color: 'indigo',
  },
];
```

---

## Configuration

### Tool Configuration Interface

```typescript
export interface ToolConfig {
  id: string; // MCP tool name (must match exactly)
  name: string; // Display name for UI
  description: string; // Tool description shown to users
  category: string; // Category ID (must exist in toolCategories)
  component?: string; // Component name (defaults to JsonViewer)
  enabled: boolean; // Whether tool is enabled/visible
}
```

### Configuration Functions

```typescript
// Get configuration for a specific tool
const toolConfig = getToolConfig('createSwap');

// Get all tools in a category
const swappingTools = getToolsByCategory('swapping');

// Get category information
const categoryInfo = getCategoryConfig('swapping');

// Get component name for a tool (with fallback)
const componentName = getComponentForTool('createSwap'); // Returns 'Swaps' or 'JsonViewer'
```

---

## Component Interface

### Required Props Pattern

Components receive different prop structures based on their purpose:

#### 1. Direct MCP Data (Simple Tools)

```typescript
interface SimpleToolProps {
  data: McpToolResponse; // Raw MCP response
}

// Used when no data transformation is needed
<ToolComponent data={result} />;
```

#### 2. Transformed Props (Complex Tools)

```typescript
interface TransformedToolProps {
  // Specific props tailored to the tool
  txPreview: TransactionPreview;
  txPlan: TransactionPlan;
  // ... other specific props
}

// Used when data needs to be transformed
const transformedData = transformCreateSwapResponse(result);
<ToolComponent {...transformedData} />;
```

### Component Requirements

1. **Error Handling**: Handle invalid or missing data gracefully
2. **Loading States**: Show appropriate loading indicators
3. **Responsive Design**: Work across desktop and mobile
4. **Accessibility**: Include proper ARIA labels and keyboard navigation
5. **TypeScript**: Use proper type definitions

### Example Component Structure

```typescript
interface MyComponentProps {
  data: MyToolData;
  isLoading?: boolean;
  error?: string;
}

export function MyComponent({ data, isLoading, error }: MyComponentProps) {
  // Handle loading state
  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  // Handle error state
  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  // Handle empty data
  if (!data) {
    return <div className="text-gray-500">No data available</div>;
  }

  // Main component render
  return <div>{/* Your component implementation */}</div>;
}
```

---

## Data Transformation

### Purpose

Data transformation converts raw MCP responses into component-friendly formats:

- **Normalize Data**: Consistent structure across different MCP servers
- **Enrich Data**: Add computed values, formatting, or derived properties
- **Simplify Props**: Break complex responses into focused prop objects

### Implementation

Create transformation functions for complex tools:

```typescript
// src/lib/dataTransformers.ts (create this file)
export function transformCreateSwapResponse(mcpResponse: any) {
  // Extract and transform the raw MCP data
  const { transaction_plan, preview_data, metadata } = mcpResponse;

  return {
    txPreview: {
      fromTokenAmount: preview_data?.fromAmount,
      fromTokenSymbol: preview_data?.fromToken?.symbol,
      fromTokenAddress: preview_data?.fromToken?.address,
      fromChain: preview_data?.fromChain,
      toTokenAmount: preview_data?.toAmount,
      toTokenSymbol: preview_data?.toToken?.symbol,
      toTokenAddress: preview_data?.toToken?.address,
      toChain: preview_data?.toChain,
    },
    txPlan: transaction_plan
      ? {
          approvals: transaction_plan.approvals || [],
          mainTransaction: transaction_plan.mainTransaction,
          chainId: transaction_plan.chainId,
          // ... other transaction plan properties
        }
      : null,
    metadata: metadata,
  };
}

// Add other transformation functions as needed
export function transformLendingResponse(mcpResponse: any) {
  // Transform lending tool responses
}
```

### Registration in ToolResultRenderer

Update the data transformation logic in `ToolResultRenderer.tsx`:

```typescript
// Transform data for specific tools
let componentProps = result;
if (toolName === 'createSwap' && componentName === 'Swaps') {
  const transformedData = transformCreateSwapResponse(result);
  componentProps = transformedData;
} else if (toolName === 'lendToken' && componentName === 'Lending') {
  const transformedData = transformLendingResponse(result);
  componentProps = transformedData;
}
// Add more transformations as needed
```

---

## Examples

### Example 1: Simple Display Component

A basic component that displays formatted data:

```typescript
// src/components/tools/TokenPrice.tsx
"use client";

import React from "react";

interface TokenPriceProps {
  data: {
    token: string;
    price: number;
    chain: string;
    timestamp: string;
  };
}

export function TokenPrice({ data }: TokenPriceProps) {
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(data.price);

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{data.token}</h2>
          <p className="text-blue-100">on {data.chain}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{formattedPrice}</div>
          <p className="text-blue-100 text-sm">
            Updated: {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Example 2: Interactive Transaction Component

A component with wallet integration and state management:

```typescript
// src/components/tools/Lending.tsx
"use client";

import React, { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface LendingProps {
  protocol: string;
  token: string;
  apy: number;
  tvl: number;
  transaction: {
    to: string;
    data: string;
    value: string;
  };
}

export function Lending({
  protocol,
  token,
  apy,
  tvl,
  transaction,
}: LendingProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const { isConnected } = useAccount();

  const handleLend = async () => {
    setIsExecuting(true);
    try {
      // Implement lending logic
      console.log("Executing lending transaction:", transaction);
      // Add actual transaction execution logic here
    } catch (error) {
      console.error("Lending failed:", error);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Lend {token}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{apy}%</div>
          <div className="text-sm text-gray-500">APY</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">${tvl.toLocaleString()}</div>
          <div className="text-sm text-gray-500">TVL</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{protocol}</div>
          <div className="text-sm text-gray-500">Protocol</div>
        </div>
      </div>

      {isConnected ? (
        <button
          className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
          onClick={handleLend}
          disabled={isExecuting}
        >
          {isExecuting ? "Lending..." : `Lend ${token}`}
        </button>
      ) : (
        <div className="text-center">
          <p className="text-gray-500 mb-4">Connect your wallet to lend</p>
          <ConnectButton />
        </div>
      )}
    </div>
  );
}
```

---

## Best Practices

### 1. Component Design

- **Single Responsibility**: Each component should handle one tool type
- **Reusable Elements**: Extract common UI patterns into shared components
- **Consistent Styling**: Use the project's design system and Tailwind classes
- **Mobile-First**: Design for mobile and scale up

### 2. Error Handling

```typescript
export function MyComponent({ data }: MyComponentProps) {
  // Validate required data
  if (!data?.requiredField) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <p className="text-yellow-800">Missing required data for this tool</p>
      </div>
    );
  }

  try {
    // Component logic
    return <div>{/* component content */}</div>;
  } catch (error) {
    console.error("Component error:", error);
    return (
      <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
        <p className="text-red-800">Failed to render component</p>
      </div>
    );
  }
}
```

### 3. Performance

- **Lazy Loading**: Components are automatically lazy-loaded
- **Memoization**: Use `React.memo()` for expensive renders
- **Avoid Large Bundles**: Keep component dependencies minimal

### 4. Testing

```typescript
// Create test files alongside components
// src/components/tools/__tests__/MyComponent.test.tsx
import { render, screen } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  it("renders with valid data", () => {
    const mockData = {
      /* test data */
    };
    render(<MyComponent data={mockData} />);
    expect(screen.getByText("Expected Content")).toBeInTheDocument();
  });

  it("handles missing data gracefully", () => {
    render(<MyComponent data={null} />);
    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
  });
});
```

### 5. TypeScript Best Practices

```typescript
// Define specific interfaces instead of using 'any'
interface SwapData {
  fromToken: {
    symbol: string;
    address: string;
    amount: string;
  };
  toToken: {
    symbol: string;
    address: string;
    amount: string;
  };
  chainId: number;
}

// Use union types for known variants
type ToolStatus = 'idle' | 'loading' | 'success' | 'error';

// Export interfaces for reuse
export interface MyComponentProps {
  data: SwapData;
  status?: ToolStatus;
  onAction?: (action: string) => void;
}
```

---

## Troubleshooting

### Component Not Loading

**Problem**: Custom component doesn't appear, falls back to JsonViewer

**Solutions**:

1. Check tool configuration in `tools.ts`
2. Verify component is registered in `toolComponentLoader.ts`
3. Ensure MCP tool name matches configuration `id` exactly
4. Check browser console for import errors

### Data Transformation Issues

**Problem**: Component receives undefined or incorrect props

**Solutions**:

1. Verify MCP response structure matches expected format
2. Add logging to transformation functions
3. Check ToolResultRenderer transformation logic
4. Validate component prop interfaces

### Styling Issues

**Problem**: Component styling doesn't match the app theme

**Solutions**:

1. Use Tailwind classes consistent with existing components
2. Check dark mode compatibility
3. Ensure responsive design works across screen sizes
4. Test component within the Card container provided by ToolResultRenderer

### Performance Issues

**Problem**: Component loads slowly or causes app lag

**Solutions**:

1. Minimize component dependencies
2. Use React.memo() for expensive renders
3. Implement proper loading states
4. Avoid large data processing in render methods

### Common Error Messages

| Error                               | Cause                          | Solution                          |
| ----------------------------------- | ------------------------------ | --------------------------------- |
| `Component not found`               | Missing component registration | Add to `toolComponentLoader.ts`   |
| `Tool config not found`             | Missing tool configuration     | Add to `tools.ts`                 |
| `Transformation function undefined` | Missing data transformer       | Implement transformation function |
| `Props validation failed`           | Type mismatch                  | Check component prop interfaces   |

---

## Conclusion

The custom tool component system provides a powerful way to create rich, interactive UIs for MCP tool responses. By following this documentation, you can:

- Create engaging user experiences tailored to specific tools
- Integrate wallet functionality and blockchain interactions
- Maintain consistency across the application
- Handle errors and edge cases gracefully

For additional help or questions, refer to the existing components like `Swaps.tsx` as examples and consult the codebase for implementation details.
