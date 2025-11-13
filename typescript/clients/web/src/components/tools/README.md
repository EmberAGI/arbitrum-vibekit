# Custom Tool Components

This directory contains custom React components for rendering specific MCP tool responses.

## Quick Start

1. **Copy the template**: `cp ComponentTemplate.tsx YourToolName.tsx`
2. **Customize the component** for your specific tool
3. **Register in `toolComponentLoader.ts`**
4. **Configure in `tools.ts`**

## Files

- `ComponentTemplate.tsx` - Template for creating new components
- `Swaps.tsx` - Token swap interface with wallet integration
- `Lending.tsx` - Lending and borrowing interface for DeFi protocols
- `Liquidity.tsx` - Liquidity pool management with position tracking
- `Pendle.tsx` - Pendle yield trading markets with detailed market info
- `ShortAddress.tsx` - Utility component for displaying shortened addresses
- `JsonViewer.tsx` - Default fallback component for all tools

## Creating a New Component

### 1. Use the Template

```bash
cp ComponentTemplate.tsx MyNewTool.tsx
```

### 2. Replace "MyTool" with Your Component Name

Use find-and-replace to change all instances:

- `MyTool` → `MyNewTool`
- `MyToolData` → `MyNewToolData`
- `MyToolProps` → `MyNewToolProps`

### 3. Define Your Data Interface

```typescript
interface MyNewToolData {
  // Match your MCP tool's response structure
  id: string;
  name: string;
  value: number;
  // ... other fields
}
```

### 4. Customize the UI

Update the render method with your specific interface:

- Remove template sections you don't need
- Add your tool-specific UI elements
- Implement any interactive functionality
- Add proper error handling

### 5. Register the Component

Add to `toolComponentLoader.ts`:

```typescript
MyNewTool: lazy(() =>
  import("@/components/tools/MyNewTool").then((m) => ({ default: m.MyNewTool }))
),
```

### 6. Configure Tool Mapping

Add to `tools.ts`:

```typescript
{
  id: "myMcpToolName",  // Must match MCP tool name exactly
  name: "My New Tool",
  description: "What this tool does",
  category: "existing-category", // Use existing or add new category
  component: "MyNewTool",
  enabled: true,
}
```

## Component Guidelines

### Required Patterns

1. **Error Handling**: Handle loading, error, and empty states
2. **TypeScript**: Use proper interfaces for props and data
3. **Responsive**: Design works on mobile and desktop
4. **Consistent Styling**: Use existing Tailwind classes and patterns

### Optional Enhancements

1. **Wallet Integration**: Use wagmi hooks for blockchain interactions
2. **State Management**: Use React hooks for component state
3. **Animations**: Add loading spinners and transitions
4. **Accessibility**: Include ARIA labels and keyboard navigation

### Example Patterns

```typescript
// Loading state
if (isLoading) {
  return <div className="animate-pulse">Loading...</div>;
}

// Error state
if (error) {
  return <div className="text-red-500">Error: {error}</div>;
}

// Empty state
if (!data) {
  return <div className="text-gray-500">No data available</div>;
}

// Interactive button
<button
  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
  onClick={handleAction}
  disabled={isProcessing}
>
  {isProcessing ? "Processing..." : "Execute"}
</button>;
```

## Testing Your Component

1. **Build the app**: `npm run build` - check for TypeScript errors
2. **Test with MCP tool**: Use your tool in the chat interface
3. **Toggle views**: Use the UI/JSON toggle to verify data structure
4. **Test edge cases**: Try with invalid/empty data

## Need Help?

- Check the main documentation: `CUSTOM_TOOL_COMPONENTS.md`
- Look at existing components like `Swaps.tsx` for patterns
- Review the `ComponentTemplate.tsx` TODO checklist
- Test with the JSON view toggle to debug data issues
