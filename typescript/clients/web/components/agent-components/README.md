# Agent Components System

This directory contains a dynamic component system for rendering agent-specific UI components based on tool invocations.

## Overview

The system allows you to:
- Add new agent components without modifying the core message renderer
- Configure which component to use for specific tool name patterns
- Extract custom props from tool invocation results
- Maintain a clean separation between different agent UIs

## Architecture

### Key Files

- `types.ts` - TypeScript interfaces for component props and registry
- `index.ts` - Barrel exports for all components
- Individual component files (e.g., `Swaps.tsx`, `Lending.tsx`)
- `../lib/component-loader.tsx` - Dynamic component loading logic
- `../agents-config.ts` - Component registry configuration

### How It Works

1. **Tool Invocation**: When a tool is called, the message renderer receives the tool name
2. **Component Resolution**: The `component-loader` uses the `componentRegistry` to find the matching component
3. **Props Extraction**: Custom props are extracted using the component's `propsExtractor` function
4. **Dynamic Loading**: The component is dynamically imported and rendered with the extracted props

## Adding a New Agent Component

### Step 1: Create the Component

Create a new component file in this directory:

```tsx
// MyNewAgent.tsx
'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import type { BaseAgentComponentProps } from './types';

export function MyNewAgent({
  txPreview,
  txPlan,
  // Add any custom props here
}: BaseAgentComponentProps & {
  // Define custom props if needed
  customData?: any;
}) {
  const { address, isConnected } = useAccount();

  return (
    <div className="p-4">
      <h3>My New Agent</h3>
      {/* Your agent-specific UI here */}
    </div>
  );
}
```

### Step 2: Export the Component

Add your component to `index.ts`:

```tsx
// Add to index.ts
export { MyNewAgent } from './MyNewAgent';
```

### Step 3: Register in Component Loader

Add your component to the `componentMap` in `../lib/component-loader.tsx`:

```tsx
// Add to componentMap in component-loader.tsx
const componentMap = {
  // ... existing components
  MyNewAgent: lazy(() => import('../components/agent-components/MyNewAgent').then(m => ({ default: m.MyNewAgent }))),
};
```

### Step 4: Configure in Agent Config

Add a registry entry in `../agents-config.ts`:

```tsx
// Add to componentRegistry in agents-config.ts
export const componentRegistry: ComponentRegistry = [
  // ... existing entries
  {
    toolNamePattern: /askMyNewAgent$/,  // Regex pattern to match tool names
    componentPath: 'MyNewAgent',
    propsExtractor: (toolInvocationResult) => ({
      // Extract custom props from the tool result
      customData: toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.customData || null,
    }),
  },
];
```

## Component Props

### Base Props

All agent components receive these base props:

- `txPreview`: Transaction preview data
- `txPlan`: Transaction plan object
- `isReadonly?`: Whether the component is in readonly mode

### Custom Props

Use the `propsExtractor` function to extract additional props from tool invocation results:

```tsx
propsExtractor: (toolInvocationResult) => ({
  positions: toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.positions || null,
  pools: toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.pools || null,
  markets: toolInvocationResult?.artifacts?.[0]?.parts || null,
})
```

## Tool Name Patterns

You can use either string suffixes or regex patterns:

```tsx
// String suffix (checks if tool name ends with this)
toolNamePattern: 'askSwapAgent'

// Regex pattern (more flexible)
toolNamePattern: /ask.*Agent$/
```

## Existing Components

- **Swaps** (`askSwapAgent`) - Token swapping interface
- **Lending** (`askLendingAgent`) - AAVE lending operations
- **Liquidity** (`askLiquidityAgent`) - Liquidity provisioning with positions and pools
- **Pendle** (`askYieldTokenizationAgent`) - Yield tokenization with markets data
- **TemplateComponent** - Fallback component for unregistered tools

## Legacy Components

The system also supports legacy components for backward compatibility:
- Weather components
- Document tools
- Other existing functionality

These use special handling in the component loader for their unique prop structures. 