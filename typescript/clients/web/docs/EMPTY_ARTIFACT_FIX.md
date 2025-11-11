# Empty Artifact Handling - Fix

## Problem

The A2A agent was sending tool call artifacts with empty `data` objects, causing components not to render:

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "tool-call-ember_onchain_actions__create_swap-...",
    "name": "tool-call-ember_onchain_actions__create_swap",
    "parts": [
      {
        "kind": "data",
        "data": {}, // ← Empty!
        "metadata": { "mimeType": "application/json" }
      }
    ]
  },
  "append": false,
  "lastChunk": false // More data expected
}
```

The previous code filtered out empty artifacts:

```typescript
if (toolData && Object.keys(toolData).length > 0) {
  // Only store if data is not empty
}
```

This meant the component never rendered, even though the artifact indicated `lastChunk: false` (more data coming).

## Solution

Updated the artifact handling to **always store artifacts**, even when data is empty, and show a loading state while waiting for the actual data.

### 1. Store Empty Artifacts

```typescript
// Store artifact even if data is empty (shows loading state)
const hasData = toolData && Object.keys(toolData).length > 0;
artifactsMap[artifactId] = {
  artifactId,
  toolName,
  input: toolData || {},
  output: toolData || {},
  append: appendMode,
  isLoading: !hasData && !event.lastChunk, // Show loading if empty and more chunks coming
};
```

**Changes:**

- Removed the `if (hasData)` guard
- Added `isLoading` flag when data is empty and more chunks expected
- Default to empty object `{}` instead of skipping

### 2. Updated ArtifactData Type

```typescript
export interface ArtifactData {
  artifactId: string;
  toolName: string;
  input: any;
  output: any;
  append?: boolean;
  isLoading?: boolean; // NEW: Indicates placeholder/loading state
}
```

### 3. Enhanced ToolResultRenderer

```typescript
// Check if result is empty (loading state from artifact)
const resultIsEmpty =
  !result || (typeof result === "object" && Object.keys(result).length === 0);
const showLoading = isLoading || resultIsEmpty;

if (showLoading) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {resultIsEmpty ? "Preparing" : "Executing"} {toolConfig?.name}...
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">
            {resultIsEmpty ? "Preparing transaction..." : "Processing..."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Features:**

- Detects empty result objects
- Shows appropriate loading message
- Different text for "preparing" vs "executing"

### 4. Pass isLoading Flag

```tsx
{
  Object.values(message.artifacts).map((artifact: any) => (
    <ToolResultRenderer
      key={artifact.artifactId}
      toolName={artifact.toolName}
      result={artifact.output || artifact.input}
      isLoading={artifact.isLoading} // NEW
      onUserAction={handleUserAction}
    />
  ));
}
```

## Expected Behavior

### Before Fix

1. Agent sends empty artifact
2. Code filters it out (no render)
3. User sees nothing
4. Task completes without showing component ❌

### After Fix

1. Agent sends empty artifact with `lastChunk: false`
2. Code stores artifact with `isLoading: true`
3. Component renders with loading state ✅
4. Shows: "Preparing Create Swap..." with spinner
5. When data arrives, component updates with actual content

## Server Response Flow

### Case 1: Empty Placeholder (Current Issue)

```
1. artifact-update: data={}, lastChunk=false
   → Renders with loading state

2. (Expected) artifact-update: data={...}, lastChunk=true
   → Updates with actual data

3. status-update: completed
```

### Case 2: Immediate Data

```
1. artifact-update: data={...}, lastChunk=true
   → Renders with data immediately

2. status-update: completed
```

## Files Modified

1. **`src/lib/hooks/useA2ASession.ts`**
   - Removed empty data filter (2 locations)
   - Added `isLoading` flag calculation
   - Always store artifacts

2. **`src/lib/types/session.ts`**
   - Added `isLoading?: boolean` to `ArtifactData`

3. **`src/components/ToolResultRenderer.tsx`**
   - Added `resultIsEmpty` detection
   - Combined `isLoading` and `resultIsEmpty` into `showLoading`
   - Updated loading message based on state

4. **`src/app/page.tsx`**
   - Pass `isLoading` prop to `ToolResultRenderer`

## Testing

### Test Case 1: Empty Artifact with Subsequent Data

**Server sends:**

```json
// First event
{"kind":"artifact-update","artifact":{"parts":[{"data":{}}],"lastChunk":false}}
// Second event (expected but not currently happening)
{"kind":"artifact-update","artifact":{"parts":[{"data":{"...actual data..."}}],"lastChunk":true}}
```

**Expected UI:**

1. Shows loading state: "Preparing Create Swap..."
2. Updates to actual swap component when data arrives

### Test Case 2: Immediate Data

**Server sends:**

```json
{"kind":"artifact-update","artifact":{"parts":[{"data":{"...data..."}}],"lastChunk":true}}
```

**Expected UI:**

1. Shows swap component immediately with data

### Test Case 3: Task Completes Before Data

**Server sends:**

```json
{"kind":"artifact-update","artifact":{"parts":[{"data":{}}],"lastChunk":false}}
{"kind":"status-update","status":{"state":"completed"},"final":true}
```

**Expected UI:**

1. Shows loading state
2. Task completes, loading state may persist
3. _Note: This is the current behavior - server should send data before completing_

## Server-Side Recommendation

The server should either:

**Option A: Send complete data immediately**

```typescript
yield {
  type: 'artifact',
  artifact: {
    name: 'tool-call-create_swap',
    parts: [{
      kind: 'data',
      data: swapData  // Complete data
    }]
  }
};
```

**Option B: Send placeholder then update**

```typescript
// Send placeholder
yield {
  type: 'artifact',
  artifact: {
    parts: [{ kind: 'data', data: {} }]
  },
  lastChunk: false
};

// ... perform operation ...

// Send actual data
yield {
  type: 'artifact',
  artifact: {
    parts: [{ kind: 'data', data: swapData }]
  },
  lastChunk: true
};
```

## Summary

✅ **Fixed:** Empty artifacts now render with loading state  
✅ **User Experience:** Users see immediate feedback  
✅ **Future-Proof:** Ready for server to send data in follow-up chunks  
✅ **Backward Compatible:** Works with existing immediate-data artifacts

The component now handles both empty placeholder artifacts and immediate-data artifacts correctly!
