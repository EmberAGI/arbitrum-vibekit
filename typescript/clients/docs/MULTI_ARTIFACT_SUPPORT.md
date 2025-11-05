# Multi-Artifact Custom Component Support

## Overview

This feature enables rendering multiple custom component artifacts within a single A2A streaming session. Each artifact has its own unique ID and can be configured to either replace previous artifacts of the same type or append alongside them using the `append` property.

## Key Features

### 1. Multiple Artifacts per Message

- A single agent response can now include multiple custom component artifacts
- Each artifact is tracked by its unique `artifactId`
- Artifacts are stored in a `Record<string, ArtifactData>` structure

### 2. Append Property Support

- **`append: true`** (default): New artifacts are added alongside existing artifacts
- **`append: false`**: New artifacts replace previous artifacts of the same `toolName`

### 3. Backward Compatibility

- Old `toolInvocation` property still works for single-artifact scenarios
- Automatically falls back to `toolInvocation` rendering when `artifacts` is not present

## Implementation Details

### Data Structure

```typescript
export interface ArtifactData {
  artifactId: string;
  toolName: string;
  input: any;
  output: any;
  append?: boolean; // If true, keep alongside others; if false, replace same type
}

export interface SessionMessage {
  id: string;
  sender: "user" | "agent" | "agent-progress" | "agent-error";
  content: string;
  timestamp: Date;
  // ... other properties

  // Legacy single artifact (backward compatibility)
  toolInvocation?: {
    toolName: string;
    input: any;
    output: any;
  };

  // New: Multiple artifacts with IDs
  artifacts?: Record<string, ArtifactData>; // Key is artifactId
}
```

### Artifact Tracking Logic

The `useA2ASession` hook maintains an `artifactsMap` during streaming:

```typescript
const artifactsMap: Record<string, any> = {};

// When receiving artifact-update event:
const artifactId = artifact?.artifactId || artifact?.id || artifactType;
const appendMode = artifact?.append !== false; // Default to append=true

// Handle append property
if (!appendMode) {
  // Clear all artifacts of the same toolName when append=false
  for (const key in artifactsMap) {
    if (artifactsMap[key].toolName === toolName) {
      delete artifactsMap[key];
    }
  }
}

// Store artifact by its ID
artifactsMap[artifactId] = {
  artifactId,
  toolName,
  input: toolData,
  output: toolData,
  append: appendMode,
};
```

## Usage Examples

### Example 1: Multiple Custom Components (append=true)

**Server Response:**

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-1",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "pools": [...],
        "totalTVL": 1000000
      }
    }]
  }
}

{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-2",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "pools": [...],
        "totalTVL": 2000000
      }
    }]
  }
}
```

**Result:** Both liquidity components are rendered, one after the other.

### Example 2: Replacing Component (append=false)

**Server Response:**

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "swap-1",
    "name": "tool-call-swaps",
    "append": false,
    "parts": [{
      "kind": "data",
      "data": {
        "quote": "100 USDC",
        "priceImpact": 0.1
      }
    }]
  }
}

{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "swap-2",
    "name": "tool-call-swaps",
    "append": false,
    "parts": [{
      "kind": "data",
      "data": {
        "quote": "105 USDC",
        "priceImpact": 0.05
      }
    }]
  }
}
```

**Result:** Only the second swap component is rendered (replaces the first).

### Example 3: Mixed Artifact Types (IMPORTANT! ✅)

**Scenario:** Different types with `append: true` - ALL are displayed together

**Server Response:**

```json
// Liquidity artifact
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-1",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": { "pool": "USDC/ETH", "tvl": 1000000 }
    }]
  }
}

// Swap artifact (DIFFERENT type)
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "swap-1",
    "name": "tool-call-swaps",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": { "quote": "100 USDC", "priceImpact": 0.1 }
    }]
  }
}

// Another liquidity artifact (SAME type as first)
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-2",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": { "pool": "WBTC/ETH", "tvl": 2000000 }
    }]
  }
}

// Pendle artifact (DIFFERENT type again)
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "pendle-1",
    "name": "tool-call-pendle",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": { "asset": "stETH", "apy": 25.3 }
    }]
  }
}
```

**Result:** All FOUR components are rendered in order received:

1. Liquidity component (USDC/ETH)
2. Swap component (quote)
3. Liquidity component (WBTC/ETH)
4. Pendle component (stETH)

**Why this works:**

- When `append: true`, artifacts are NEVER deleted
- Different types (liquidity, swaps, pendle) coexist naturally
- Same types (liquidity-1, liquidity-2) also coexist because `append: true`
- The deletion loop only runs when `append: false` AND only deletes matching toolNames

## Modified Files

### 1. `src/lib/types/session.ts`

- Added `ArtifactData` interface
- Added `artifacts` property to `SessionMessage`
- Kept `toolInvocation` for backward compatibility

### 2. `src/lib/hooks/useA2ASession.ts`

- Added `artifactsMap` to track artifacts by ID
- Implemented append/replace logic based on `append` property
- Updated `sendMessage()` function
- Updated `reconnectToStream()` function
- Passes `artifacts` to `onMessage()` callback

### 3. `src/app/page.tsx`

- Updated message rendering to support multiple artifacts
- Renders each artifact in `message.artifacts` using `ToolResultRenderer`
- Falls back to `toolInvocation` if `artifacts` is not present
- Uses `space-y-2` for vertical spacing between artifacts

## Rendering Behavior

```tsx
{
  /* Backward compatibility: Single artifact */
}
{
  message.toolInvocation && !message.artifacts && (
    <div className="mt-2">
      <ToolResultRenderer
        toolName={message.toolInvocation.toolName}
        result={message.toolInvocation.output || message.toolInvocation.input}
      />
    </div>
  );
}

{
  /* New: Multiple artifacts */
}
{
  message.artifacts && Object.keys(message.artifacts).length > 0 && (
    <div className="mt-2 space-y-2">
      {Object.values(message.artifacts).map((artifact: any) => (
        <ToolResultRenderer
          key={artifact.artifactId}
          toolName={artifact.toolName}
          result={artifact.output || artifact.input}
        />
      ))}
    </div>
  );
}
```

## Testing Scenarios

### Test Case 1: Multiple Append Artifacts

1. **Setup:** Connect to A2A agent with custom component support
2. **Action:** Send a message that returns multiple artifacts with `append: true`
3. **Expected:** All artifacts are rendered vertically in the message
4. **Verify:** Each artifact has its own custom component card

### Test Case 2: Replace Mode

1. **Setup:** Connect to A2A agent
2. **Action:** Send a message that returns multiple artifacts of the same type with `append: false`
3. **Expected:** Only the last artifact of each type is rendered
4. **Verify:** Previous artifacts are replaced, not accumulated

### Test Case 3: Mixed Types with Append

1. **Setup:** Connect to A2A agent
2. **Action:** Send a message that returns artifacts of different types (liquidity, swaps, etc.)
3. **Expected:** All artifacts are rendered in the order received
4. **Verify:** Different component types are displayed correctly

### Test Case 4: Reconnection with Artifacts

1. **Setup:** Start a streaming task with multiple artifacts
2. **Action:** Refresh the page or switch sessions
3. **Expected:** On reconnection, artifacts continue to accumulate/replace correctly
4. **Verify:** No duplicate artifacts or missing artifacts

### Test Case 5: Backward Compatibility

1. **Setup:** Use old A2A response format with single `toolInvocation`
2. **Action:** Send a message
3. **Expected:** Single artifact renders using old `toolInvocation` path
4. **Verify:** No breaking changes to existing functionality

## Artifact ID Generation

The system prioritizes artifact IDs in this order:

1. `artifact.artifactId` (explicit ID from server)
2. `artifact.id` (fallback ID)
3. `artifactType` (name-based fallback)

**Best Practice:** Always provide explicit `artifactId` in server responses for reliable tracking.

## Append Property Behavior

| Scenario                         | `append` Value | Behavior                       |
| -------------------------------- | -------------- | ------------------------------ |
| First artifact of type           | `true`         | Added to map                   |
| Subsequent artifact of same type | `true`         | Added alongside existing       |
| First artifact of type           | `false`        | Added to map                   |
| Subsequent artifact of same type | `false`        | Replaces previous of same type |
| Omitted                          | (default)      | Treated as `true`              |

## Performance Considerations

- Artifacts are stored in a plain object (`Record<string, ArtifactData>`)
- Lookups and updates are O(1) operations
- Rendering uses `Object.values()` which is efficient for reasonable artifact counts
- Each artifact is memoized by React using unique `artifactId` as key

## Future Enhancements

- Add artifact ordering/priority system
- Support artifact expiration/TTL
- Add artifact animations (fade in/out)
- Support artifact grouping by type
- Add artifact export/save functionality
- Implement artifact history/versioning

## Debugging

To debug artifact handling, check the debug console:

```
[A2ASession] Event: artifact-update for session: conv-xxx
[A2ASession] Processing artifact: liquidity-1
[A2ASession] Artifact stored: { artifactId: 'liquidity-1', toolName: 'liquidity', append: true }
```

You can inspect the artifacts map in the message object:

```javascript
console.log(message.artifacts);
// Output: { 'liquidity-1': {...}, 'swap-1': {...} }
```

## API Contract

### Server Response Format

```typescript
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": string,      // Required: Unique ID for artifact
    "name": string,             // Format: "tool-call-{toolName}"
    "append": boolean,          // Optional: Default true
    "parts": [{
      "kind": "data",
      "data": {
        ...                     // Custom component data
      }
    }]
  },
  "lastChunk": boolean          // Optional: Indicates final chunk
}
```

### Client Message Format

```typescript
{
  "artifacts": {
    "[artifactId]": {
      "artifactId": string,
      "toolName": string,
      "input": any,
      "output": any,
      "append": boolean
    }
  }
}
```

## Limitations

1. **Storage:** Large numbers of artifacts (100+) may impact localStorage size
2. **Rendering:** Many artifacts in a single message may cause scroll performance issues
3. **Network:** Each artifact chunk is processed sequentially during streaming

## Best Practices

1. **Use Explicit IDs:** Always provide `artifactId` in server responses
2. **Set Append Appropriately:** Use `append: false` for dynamic/updating components
3. **Limit Artifacts:** Keep artifacts per message under 20 for best UX
4. **Use Meaningful IDs:** Use descriptive IDs like `pool-${poolId}` instead of random strings
5. **Test Reconnection:** Always test that artifacts persist correctly on reconnection
