# Multi-Artifact Test Cases

## Test Case 1: Multiple Different Types with append=true ✅

**Scenario:** Agent returns artifacts of different types (liquidity, swaps, pendle) all with `append: true`

### Input Stream:

```json
// Artifact 1: Liquidity
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-pool-1",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "pool": "USDC/ETH",
        "tvl": 1000000,
        "apy": 15.5
      }
    }]
  }
}

// Artifact 2: Swap Quote
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "swap-quote-1",
    "name": "tool-call-swaps",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "tokenIn": "ETH",
        "tokenOut": "USDC",
        "amountOut": 2500,
        "priceImpact": 0.1
      }
    }]
  }
}

// Artifact 3: Pendle Position
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "pendle-position-1",
    "name": "tool-call-pendle",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "asset": "stETH",
        "maturity": "2025-03-31",
        "apy": 25.3
      }
    }]
  }
}

// Artifact 4: Another Liquidity Pool
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "liquidity-pool-2",
    "name": "tool-call-liquidity",
    "append": true,
    "parts": [{
      "kind": "data",
      "data": {
        "pool": "WBTC/ETH",
        "tvl": 2000000,
        "apy": 18.2
      }
    }]
  }
}
```

### Expected Result:

**artifactsMap:**

```javascript
{
  "liquidity-pool-1": { artifactId: "liquidity-pool-1", toolName: "liquidity", ... },
  "swap-quote-1": { artifactId: "swap-quote-1", toolName: "swaps", ... },
  "pendle-position-1": { artifactId: "pendle-position-1", toolName: "pendle", ... },
  "liquidity-pool-2": { artifactId: "liquidity-pool-2", toolName: "liquidity", ... }
}
```

**Rendered UI:**

- Liquidity component for pool 1 (USDC/ETH)
- Swap component for quote
- Pendle component for position
- Liquidity component for pool 2 (WBTC/ETH)

✅ **All 4 artifacts displayed in order received**

---

## Test Case 2: Same Type with append=true ✅

**Scenario:** Multiple artifacts of the SAME type with `append: true`

### Input Stream:

```json
// Artifact 1
{
  "artifactId": "lending-1",
  "name": "tool-call-lending",
  "append": true,
  "parts": [{ "kind": "data", "data": { "protocol": "Aave", "apy": 4.5 } }]
}

// Artifact 2
{
  "artifactId": "lending-2",
  "name": "tool-call-lending",
  "append": true,
  "parts": [{ "kind": "data", "data": { "protocol": "Compound", "apy": 5.2 } }]
}

// Artifact 3
{
  "artifactId": "lending-3",
  "name": "tool-call-lending",
  "append": true,
  "parts": [{ "kind": "data", "data": { "protocol": "Spark", "apy": 4.8 } }]
}
```

### Expected Result:

**artifactsMap:**

```javascript
{
  "lending-1": { toolName: "lending", ... },
  "lending-2": { toolName: "lending", ... },
  "lending-3": { toolName: "lending", ... }
}
```

✅ **All 3 lending components displayed**

---

## Test Case 3: Mixed append=true and append=false ✅

**Scenario:** Some artifacts with `append: true`, others with `append: false`

### Input Stream:

```json
// 1. First liquidity (append=true)
{
  "artifactId": "liq-1",
  "name": "tool-call-liquidity",
  "append": true,
  "parts": [...]
}

// 2. First swap (append=false)
{
  "artifactId": "swap-1",
  "name": "tool-call-swaps",
  "append": false,
  "parts": [...]
}

// 3. Second liquidity (append=true)
{
  "artifactId": "liq-2",
  "name": "tool-call-liquidity",
  "append": true,
  "parts": [...]
}

// 4. Second swap (append=false) - REPLACES swap-1
{
  "artifactId": "swap-2",
  "name": "tool-call-swaps",
  "append": false,
  "parts": [...]
}

// 5. Third liquidity (append=false) - REPLACES liq-1 and liq-2
{
  "artifactId": "liq-3",
  "name": "tool-call-liquidity",
  "append": false,
  "parts": [...]
}
```

### Expected Result:

**artifactsMap:**

```javascript
{
  "swap-2": { toolName: "swaps", ... },    // swap-1 was replaced
  "liq-3": { toolName: "liquidity", ... }   // liq-1 and liq-2 were replaced
}
```

✅ **Only swap-2 and liq-3 displayed**

---

## Test Case 4: Complex Real-World Scenario ✅

**Scenario:** DeFi workflow showing multiple pools, getting quotes, and showing recommendations

### Input Stream:

```json
// 1. Show multiple liquidity pools (comparison)
{ "artifactId": "pool-uniswap", "name": "tool-call-liquidity", "append": true }
{ "artifactId": "pool-curve", "name": "tool-call-liquidity", "append": true }
{ "artifactId": "pool-balancer", "name": "tool-call-liquidity", "append": true }

// 2. Get swap quotes (keep updating to show best)
{ "artifactId": "quote-1", "name": "tool-call-swaps", "append": false }
{ "artifactId": "quote-2", "name": "tool-call-swaps", "append": false }
{ "artifactId": "quote-3", "name": "tool-call-swaps", "append": false }

// 3. Show Pendle yield opportunities
{ "artifactId": "pendle-1", "name": "tool-call-pendle", "append": true }
{ "artifactId": "pendle-2", "name": "tool-call-pendle", "append": true }

// 4. Final lending recommendation (single best)
{ "artifactId": "lending-final", "name": "tool-call-lending", "append": false }
```

### Expected Result:

**artifactsMap:**

```javascript
{
  "pool-uniswap": { toolName: "liquidity", ... },
  "pool-curve": { toolName: "liquidity", ... },
  "pool-balancer": { toolName: "liquidity", ... },
  "quote-3": { toolName: "swaps", ... },          // Only last quote
  "pendle-1": { toolName: "pendle", ... },
  "pendle-2": { toolName: "pendle", ... },
  "lending-final": { toolName: "lending", ... }
}
```

✅ **3 liquidity pools + 1 swap quote + 2 pendle positions + 1 lending = 7 components**

---

## Test Case 5: Reconnection Preserves Artifacts ✅

**Scenario:** User refreshes page mid-stream, reconnection should preserve artifacts

### Steps:

1. Agent sends artifacts 1-3 with `append: true`
2. User refreshes browser
3. Session reconnects
4. Agent sends artifacts 4-5 with `append: true`

### Expected Result:

- Artifacts 1-3 are restored from localStorage
- Artifacts 4-5 are added during reconnection
- All 5 artifacts displayed

---

## Test Case 6: Empty append (defaults to true) ✅

**Scenario:** Server doesn't specify `append` property

### Input:

```json
{
  "artifactId": "default-1",
  "name": "tool-call-liquidity",
  // NO append property
  "parts": [...]
}
```

### Code:

```typescript
const appendMode = artifact?.append !== false; // Default to append=true
```

### Expected Result:

✅ **Treated as `append: true`, artifact is added**

---

## Implementation Verification

The key logic in `useA2ASession.ts`:

```typescript
const artifactId = artifact?.artifactId || artifact?.id || artifactType;
const appendMode = artifact?.append !== false; // Default to append=true

if (toolData && Object.keys(toolData).length > 0) {
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
}
```

### Why Different Types Work:

**Trace for different types with append=true:**

```
1. Receive liquidity artifact (append=true)
   - appendMode = true
   - !appendMode = false → SKIP deletion loop
   - Add to artifactsMap["liq-1"]

2. Receive swap artifact (append=true)
   - appendMode = true
   - !appendMode = false → SKIP deletion loop
   - Add to artifactsMap["swap-1"]

3. Receive another liquidity (append=true)
   - appendMode = true
   - !appendMode = false → SKIP deletion loop
   - Add to artifactsMap["liq-2"]

Result: artifactsMap has all 3 artifacts!
```

**Trace for same type with append=false:**

```
1. Receive swap-1 (append=false)
   - appendMode = false
   - !appendMode = true → Execute deletion loop
   - Loop through artifactsMap checking toolName === "swaps"
   - No matching artifacts found (first one)
   - Add artifactsMap["swap-1"]

2. Receive swap-2 (append=false)
   - appendMode = false
   - !appendMode = true → Execute deletion loop
   - Loop through artifactsMap checking toolName === "swaps"
   - Found: artifactsMap["swap-1"].toolName === "swaps"
   - DELETE artifactsMap["swap-1"]
   - Add artifactsMap["swap-2"]

Result: Only swap-2 remains!
```

---

## Edge Cases

### Edge Case 1: Duplicate Artifact IDs

**Input:**

```json
{ "artifactId": "dup-1", "name": "tool-call-liquidity", "append": true }
{ "artifactId": "dup-1", "name": "tool-call-swaps", "append": true }  // Same ID!
```

**Result:** Second artifact OVERWRITES first (same key in object)

**Recommendation:** Server should generate unique IDs

### Edge Case 2: No Artifact ID

**Input:**

```json
{ "name": "tool-call-liquidity" } // No artifactId
```

**Code:**

```typescript
const artifactId = artifact?.artifactId || artifact?.id || artifactType;
// artifactId = "tool-call-liquidity"
```

**Result:** Uses name as ID. Multiple artifacts with no ID will overwrite each other.

**Recommendation:** Always provide explicit `artifactId`

---

## Performance Test

**Scenario:** 50 artifacts of various types

### Expected Behavior:

- Rendering: O(n) where n = number of artifacts
- Lookup: O(1) per artifact (object key lookup)
- UI: Each artifact renders independently with React key
- Memory: Reasonable for typical use cases (<50 artifacts)

---

## Manual Testing Checklist

- [ ] Send message that returns 3+ different artifact types with append=true
- [ ] Verify all artifacts render
- [ ] Send message that returns same type with append=false
- [ ] Verify only last artifact of that type renders
- [ ] Refresh page mid-stream
- [ ] Verify artifacts persist and continue accumulating
- [ ] Switch to another session and back
- [ ] Verify artifacts remain intact
- [ ] Check debug console for proper artifact logging
- [ ] Inspect artifacts map in React DevTools
