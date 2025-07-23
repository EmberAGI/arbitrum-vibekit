# Dynamic Agent Sidepanel System

This system provides dynamic sidepanels that can be triggered by agent selection, tool invocations, or the presence of specific properties in tool responses. Sidepanels are full-screen overlays similar to artifacts but specifically designed for agent-specific functionality.

## Overview

The dynamic sidepanel system allows you to:
- **Display custom sidepanels automatically** when agents are selected
- **Trigger sidepanels on tool invocations** with specific tool name patterns
- **Show sidepanels based on data properties** in tool responses
- **Configure multiple trigger conditions** with priority-based resolution
- **Pass custom extracted props** to each sidepanel

## Architecture

### Key Components

- **`types.ts`** - TypeScript interfaces for props and configuration
- **Sidepanel Components** - React components (e.g., `hello-world-sidepanel.tsx`)
- **Artifact Definitions** - Artifact wrappers for sidepanels (e.g., `hello-world-artifact.tsx`)
- **`../lib/sidepanel-loader.tsx`** - Dynamic loading and trigger logic
- **`../agents-config.ts`** - Configuration registry

### How It Works

1. **Configuration**: Sidepanels are configured in `agentSidepanelRegistry` with trigger conditions
2. **Detection**: The system monitors for trigger events (agent selection, tool calls, property existence)
3. **Resolution**: Matching configurations are found and sorted by priority
4. **Loading**: The appropriate sidepanel artifact is dynamically loaded
5. **Props Extraction**: Custom props are extracted using the `propsExtractor` function
6. **Display**: The sidepanel is shown using the artifact system

## Trigger Modes

### 1. On Agent Selection (`on-agent-selection`)

Shows sidepanel immediately when an agent is selected.

```tsx
{
  sidepanelId: 'hello-world',
  agentId: 'ember-aave',
  triggerMode: 'on-agent-selection',
  priority: 10,
  propsExtractor: (data) => ({
    message: `Welcome to ${data.selectedAgentId}!`,
  }),
}
```

### 2. On Tool Invocation (`on-tool-invocation`)

Shows sidepanel when specific tool calls complete.

```tsx
{
  sidepanelId: 'swap-results',
  agentId: 'ember-camelot',
  triggerMode: 'on-tool-invocation',
  toolNamePattern: /askSwapAgent$/,
  priority: 5,
  propsExtractor: (data) => ({
    swapData: data.toolInvocationResult,
    txHash: data.txPreview?.hash,
  }),
}
```

### 3. On Property Existence (`on-property-existence`)

Shows sidepanel when specific properties exist in tool responses.

```tsx
{
  sidepanelId: 'transaction-monitor',
  agentId: 'all', // Works for any agent
  triggerMode: 'on-property-existence',
  triggerProperty: 'artifacts.0.parts.0.data.txPlan',
  priority: 1,
  propsExtractor: (data) => ({
    transactionPlan: data.toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.txPlan,
  }),
}
```

## Creating a New Agent Sidepanel

### Step 1: Create the Sidepanel Component

```tsx
// my-agent-sidepanel.tsx
'use client';

import type { BaseAgentSidepanelProps } from './types';

interface MyAgentSidepanelProps extends BaseAgentSidepanelProps {
  customData?: any;
}

export function MyAgentSidepanel({
  txPreview,
  txPlan,
  toolInvocationResult,
  selectedAgentId,
  isReadonly,
  customData,
}: MyAgentSidepanelProps) {
  return (
    <div className="p-6 h-full">
      <h1 className="text-2xl font-bold">My Agent Sidepanel</h1>
      <p>Agent: {selectedAgentId}</p>
      {customData && (
        <div className="mt-4">
          <h3>Custom Data:</h3>
          <pre>{JSON.stringify(customData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

### Step 2: Create the Artifact Definition

```tsx
// my-agent-artifact.tsx
import { Artifact } from '@/components/create-artifact';
import { CopyIcon } from '@/components/icons';
import { MyAgentSidepanel } from './my-agent-sidepanel';

export const myAgentArtifact = new Artifact<'my-agent', any>({
  kind: 'my-agent',
  description: 'My custom agent sidepanel',
  initialize: async () => {},
  onStreamPart: ({ setArtifact }) => {
    setArtifact((current) => ({ ...current, status: 'streaming' }));
  },
  content: ({ content }) => {
    let props = {};
    try {
      props = content ? JSON.parse(content) : {};
    } catch (e) {
      props = {};
    }
    
    return <MyAgentSidepanel {...props} />;
  },
  actions: [
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy data',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content || '{}');
      },
    },
  ],
  toolbar: [],
});
```

### Step 3: Register the Artifact

Add to `components/artifact.tsx`:

```tsx
import { myAgentArtifact } from '@/artifacts/agent-sidepanels/my-agent-artifact';

export const artifactDefinitions: any[] = [
  // ... existing artifacts
  myAgentArtifact as any,
];
```

### Step 4: Add to Sidepanel Loader

Update `lib/sidepanel-loader.tsx`:

```tsx
const sidepanelArtifacts = {
  'hello-world': () => import('../artifacts/agent-sidepanels/hello-world-artifact').then(m => m.helloWorldArtifact),
  'my-agent': () => import('../artifacts/agent-sidepanels/my-agent-artifact').then(m => m.myAgentArtifact),
};
```

### Step 5: Configure in Agent Config

Add to `agents-config.ts`:

```tsx
export const agentSidepanelRegistry: AgentSidepanelRegistry = [
  // ... existing configs
  {
    sidepanelId: 'my-agent',
    agentId: 'my-agent-id',
    triggerMode: 'on-agent-selection',
    priority: 5,
    propsExtractor: (data) => ({
      customData: {
        timestamp: new Date().toISOString(),
        agentId: data.selectedAgentId,
      },
    }),
  },
];
```

## Configuration Options

### Priority System

When multiple configurations match, the system uses priority to determine which sidepanel to show:
- **Higher priority wins** (priority: 10 beats priority: 5)
- **Default priority is 0** if not specified
- **Only one sidepanel shows** at a time (highest priority)

### Props Extraction

The `propsExtractor` function receives:

```tsx
{
  toolInvocationResult?: any;  // Full tool response
  selectedAgentId?: string;    // Current agent ID
  txPreview?: any;            // Transaction preview data
  txPlan?: any;               // Transaction plan data
}
```

Extract any props your sidepanel needs:

```tsx
propsExtractor: (data) => ({
  // Basic props
  message: `Hello ${data.selectedAgentId}!`,
  
  // From tool results
  positions: data.toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.positions,
  
  // From transaction data
  gasEstimate: data.txPreview?.gasEstimate,
  
  // Computed props
  timestamp: new Date().toISOString(),
  isSwapTransaction: data.txPlan?.type === 'swap',
})
```

### Tool Name Patterns

Use regex or string patterns to match tool names:

```tsx
// Exact suffix match
toolNamePattern: 'askSwapAgent'

// Regex pattern
toolNamePattern: /ask.*Agent$/

// Multiple patterns (use separate configs)
```

### Property Path Checking

For property-based triggers, use dot notation:

```tsx
// Simple property
triggerProperty: 'txPlan'

// Nested property
triggerProperty: 'artifacts.0.parts.0.data.txPlan'

// Array property
triggerProperty: 'results.transactions.0.hash'
```

## Current Implementation

### Hello World Sidepanel

The system includes a complete Hello World example:

- **Component**: `hello-world-sidepanel.tsx`
- **Artifact**: `hello-world-artifact.tsx`
- **Configuration**: Shows for `ember-aave` agent on selection
- **Features**: Displays agent info, transaction data, and tool results

This serves as both a working example and a template for creating new sidepanels.

## Integration Points

### Message Renderer

The message renderer automatically triggers sidepanels:
- **On tool invocation results** with matching patterns
- **On property existence** in tool responses

### Chat Component

The chat component triggers sidepanels:
- **On agent selection** when switching between agents

### Artifact System

Sidepanels use the existing artifact infrastructure:
- **Full-screen overlays** with animations
- **Action buttons** and toolbar support
- **Streaming updates** and metadata management

## Best Practices

1. **Use descriptive sidepanel IDs** that indicate purpose
2. **Set appropriate priorities** to avoid conflicts
3. **Extract minimal necessary props** for performance
4. **Handle missing data gracefully** in components
5. **Test all trigger modes** for your use case
6. **Document custom prop interfaces** for maintainability

## Debugging

Enable logging to debug sidepanel triggers:

```tsx
// In sidepanel-loader.tsx
console.log('Triggering sidepanel:', { agentId, triggerMode, config });
```

Check the browser console for:
- Configuration matching results
- Props extraction output
- Artifact loading errors 