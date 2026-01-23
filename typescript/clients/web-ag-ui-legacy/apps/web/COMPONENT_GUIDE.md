# Component Development Guide

A practical guide for creating components in the Web Agent UI project.

## 📋 Quick Reference

### Component Types

| Type | Location | Purpose | Example |
|------|----------|---------|---------|
| UI Primitive | `components/ui/` | Reusable, generic UI | Button, Input, Modal |
| Domain Component | `components/[domain]/` | Business-specific | AgentsTable, AgentCard |
| Page Component | `components/` | Full-page layouts | HireAgentsPage |
| Layout Component | `app/layout.tsx` | App-wide layout | RootLayout |

## 🎯 Component Templates

### 1. UI Component Template

```typescript
// components/ui/Button.tsx

/**
 * Primary button component for user actions.
 * Supports primary and secondary variants.
 */

interface ButtonProps {
  /** Button style variant */
  variant?: 'primary' | 'secondary';
  /** Button content */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function Button({
  variant = 'primary',
  children,
  onClick,
  disabled = false,
  className = '',
}: ButtonProps) {
  const baseStyles = 'px-6 py-2.5 rounded-lg font-medium transition-colors';
  const variantStyles = {
    primary: 'bg-[#fd6731] hover:bg-[#e55a28] text-white',
    secondary: 'bg-[#2a2a2a] hover:bg-[#333] text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {children}
    </button>
  );
}
```

### 2. Domain Component Template

```typescript
// components/agents/AgentCard.tsx

import { Button } from '../ui/Button';
import type { Agent } from '@/types/agent';

/**
 * Displays agent information in card format.
 * Used in agent lists and grids.
 */

interface AgentCardProps {
  /** Agent data to display */
  agent: Agent;
  /** Handler when user clicks to view details */
  onView: (agentId: string) => void;
  /** Handler when user clicks to hire */
  onHire: (agentId: string) => void;
}

export function AgentCard({ agent, onView, onHire }: AgentCardProps) {
  return (
    <div
      className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 hover:border-[#3a3a3a] transition-colors cursor-pointer"
      onClick={() => onView(agent.id)}
    >
      {/* Avatar */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-4"
        style={{ background: agent.avatarBg }}
      >
        {agent.avatar}
      </div>

      {/* Agent Info */}
      <h3 className="text-lg font-semibold text-white mb-2">{agent.name}</h3>
      <p className="text-sm text-gray-400 mb-4">{agent.creator}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">APY</div>
          <div className="text-white font-medium">{agent.apy}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Users</div>
          <div className="text-white font-medium">{agent.users}</div>
        </div>
      </div>

      {/* Action */}
      <Button
        variant="primary"
        onClick={(e) => {
          e.stopPropagation();
          onHire(agent.id);
        }}
        className="w-full"
      >
        Hire Agent
      </Button>
    </div>
  );
}
```

### 3. Page Component Template

```typescript
// components/NewFeaturePage.tsx

'use client';

import { useState } from 'react';
import { SearchBar } from './ui/SearchBar';
import { Button } from './ui/Button';

/**
 * New Feature page displaying [feature description].
 * Includes search, filters, and [main content].
 */

export interface NewFeaturePageProps {
  /** List of items to display */
  items: ItemType[];
  /** Handler for item actions */
  onItemAction: (itemId: string) => void;
}

export function NewFeaturePage({ items, onItemAction }: NewFeaturePageProps) {
  // Page-level state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Filter items based on search and filters
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || item.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Page Header */}
        <h1 className="text-3xl font-bold text-white mb-8">New Feature</h1>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <Button variant="secondary">Filter</Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <ItemCard key={item.id} item={item} onAction={onItemAction} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

## 🎨 Styling Patterns

### Common Layout Classes

```typescript
// Page Container
<div className="flex-1 overflow-y-auto p-8">
  <div className="max-w-[1400px] mx-auto">

// Card
<div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">

// Card with Hover
<div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6 hover:border-[#3a3a3a] transition-colors">

// Section Header
<h2 className="text-2xl font-semibold text-white mb-4">

// Grid Layout (Responsive)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

### Interactive Elements

```typescript
// Primary Button
<button className="px-6 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors">

// Secondary Button
<button className="px-4 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white transition-colors">

// Input Field
<input className="w-full px-4 py-2.5 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#fd6731] transition-colors" />

// Tab (Active)
<button className="px-4 py-2 rounded-lg bg-[#2a2a2a] text-white">

// Tab (Inactive)
<button className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors">
```

### Status Indicators

```typescript
// Success/Active
<span className="px-3 py-1 rounded-full bg-teal-500/20 text-teal-400 text-sm">Active</span>

// Error/Blocked
<span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm">Error</span>

// Warning
<span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm">Warning</span>

// Info/Neutral
<span className="px-3 py-1 rounded-full bg-gray-500/20 text-gray-400 text-sm">Info</span>
```

## 🔧 Common Patterns

### Loading State

```typescript
export function MyComponent({ data, isLoading }: MyComponentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return <div>{/* Normal content */}</div>;
}
```

### Empty State

```typescript
if (items.length === 0) {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-semibold text-white mb-2">No Items Found</h3>
        <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
      </div>
    </div>
  );
}
```

### Error State

```typescript
if (error) {
  return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
      <div className="flex items-center gap-2 text-red-400 mb-2">
        <AlertCircle className="w-5 h-5" />
        <span className="font-medium">Error Loading Data</span>
      </div>
      <p className="text-red-300 text-sm">{error.message}</p>
    </div>
  );
}
```

## 📦 Component Composition

### Building Complex Components

```typescript
// Large component that's getting unwieldy? Extract sub-components!

// ❌ Bad: Everything in one component
export function HireAgentsPage() {
  return (
    <div>
      {/* 500 lines of JSX */}
    </div>
  );
}

// ✅ Good: Extracted sub-components
export function HireAgentsPage({ agents }: HireAgentsPageProps) {
  return (
    <div>
      <PageHeader />
      <SearchAndFilters />
      <AgentsTable agents={agents} />
      <Pagination />
    </div>
  );
}

// Sub-components can be in the same file if they're only used here
function PageHeader() {
  return <h1 className="text-3xl font-bold text-white mb-8">Hire Agents</h1>;
}

function SearchAndFilters() {
  const [search, setSearch] = useState('');
  return <SearchBar value={search} onChange={setSearch} />;
}
```

## ✅ Best Practices Checklist

### Before Committing a Component

- [ ] TypeScript interfaces exported for all props
- [ ] JSDoc comment at top explaining purpose
- [ ] Handles loading/error/empty states if applicable
- [ ] Follows established naming conventions
- [ ] Uses existing UI components where possible
- [ ] Responsive design (mobile-friendly)
- [ ] Accessible (keyboard navigation, ARIA labels)
- [ ] Component is under 300 lines
- [ ] No hardcoded data (use props)
- [ ] Follows existing color/spacing patterns

### Code Quality

- [ ] No `any` types
- [ ] Proper event handler naming (`onX` for props, `handleX` for internal)
- [ ] Extracted repetitive JSX into sub-components
- [ ] Used meaningful variable names
- [ ] Avoided deep nesting (max 4 levels)

## 🚀 Real Examples

See these files for reference:
- **UI Component**: `components/ui/SearchBar.tsx`
- **UI Component with variants**: `components/ui/FilterTabs.tsx`
- **Domain Component**: `components/agents/AgentsTable.tsx`
- **Page Component**: `components/HireAgentsPage.tsx`
- **Route Page**: `app/hire-agents/page.tsx`

## 💡 Tips

1. **Start Simple**: Build the basic version first, add features incrementally
2. **Copy Existing Patterns**: Look at similar components for styling consistency
3. **Test Responsively**: Check mobile, tablet, and desktop views
4. **Think Reusability**: Could this component be used elsewhere?
5. **Ask for Review**: When unsure, ask the team about the pattern

## 🔗 Related Docs

- See `README.md` for project structure and setup
- See existing components in `components/` for examples
- See `types/agent.ts` for type definitions

---

**Remember**: Good components are small, focused, and composable. If a component is doing too much, it's time to split it up!
