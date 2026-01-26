# Web Agent UI

Agent marketplace and management interface for hiring and monitoring AI agents.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix
```

## 📁 Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx             # Root layout with AppSidebar
│   ├── page.tsx               # Home (redirects to /hire-agents)
│   ├── hire-agents/           # Agents marketplace
│   │   ├── page.tsx          # Agents list
│   │   └── [id]/             # Individual agent details
│   │       └── page.tsx
│   ├── acquire/               # Placeholder page
│   ├── leaderboard/           # Placeholder page
│   └── api/                   # API routes
│
├── components/
│   ├── ui/                    # Reusable UI primitives
│   │   ├── SearchBar.tsx     # Search input component
│   │   ├── FilterTabs.tsx    # Tab filter component
│   │   └── Pagination.tsx    # Pagination controls
│   ├── agents/                # Domain-specific components
│   │   └── AgentsTable.tsx   # Agents table with rows
│   ├── AppSidebar.tsx         # Main navigation sidebar
│   ├── HireAgentsPage.tsx     # Agents marketplace UI
│   ├── AgentDetailPage.tsx    # Individual agent detail UI
│   └── Providers.tsx          # Context providers
│
├── hooks/                      # Custom React hooks
│   ├── useAgentConnection.ts  # Agent data and actions
│   ├── usePrivyWalletClient.ts
│   └── useUpgradeToSmartAccount.ts
│
├── config/                     # Configuration files
│   ├── agents.ts              # Agent registry
│   └── evmChains.ts          # EVM chain configurations
│
└── types/                      # TypeScript type definitions
    └── agent.ts
```

## 🏗️ Architecture Patterns

### Route Structure
- Routes in `app/` follow Next.js App Router conventions
- Each route has a `page.tsx` that handles data fetching and routing logic
- UI components are separated into `components/` for reusability and testing

### Component Separation
```typescript
// page.tsx - Route Handler (Smart Component)
// - Data fetching with hooks
// - Routing logic
// - Business logic
export default function HireAgentsRoute() {
  const agent = useAgentConnection(DEFAULT_AGENT_ID);
  return <HireAgentsPage agents={agentList} />;
}

// HireAgentsPage.tsx - Presentation Component (Dumb Component)
// - Pure UI rendering
// - Receives data via props
// - Emits events via callbacks
export function HireAgentsPage({ agents, onHireAgent }) {
  return <div>...</div>;
}
```

**Benefits:**
- ✅ Testable in isolation
- ✅ Reusable across routes
- ✅ Clear separation of concerns
- ✅ Server/Client boundary flexibility

### Component Hierarchy

```
Page Route (page.tsx)
  └── Page Component (HireAgentsPage.tsx)
      ├── UI Components (SearchBar, FilterTabs)
      └── Domain Components (AgentsTable)
          └── UI Primitives
```

## 🎨 Component Guidelines

### Creating New Components

#### 1. UI Components (`components/ui/`)
Pure, reusable components with no business logic.

```typescript
// components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', children, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className={variant === 'primary' ? 'bg-[#fd6731]' : 'bg-[#2a2a2a]'}
    >
      {children}
    </button>
  );
}
```

#### 2. Domain Components (`components/agents/`, `components/[domain]/`)
Business-specific components that use UI components.

```typescript
// components/agents/AgentCard.tsx
import { Button } from '../ui/Button';

interface AgentCardProps {
  agent: Agent;
  onHire: (id: string) => void;
}

export function AgentCard({ agent, onHire }: AgentCardProps) {
  return (
    <div>
      <h3>{agent.name}</h3>
      <Button onClick={() => onHire(agent.id)}>Hire</Button>
    </div>
  );
}
```

#### 3. Page Components (`components/[PageName]Page.tsx`)
Full-page UI components that compose domain and UI components.

```typescript
// components/HireAgentsPage.tsx
export interface HireAgentsPageProps {
  agents: Agent[];
  onHireAgent: (id: string) => void;
  onViewAgent: (id: string) => void;
}

export function HireAgentsPage({ agents, onHireAgent }: HireAgentsPageProps) {
  // Page-level state
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <AgentsTable agents={agents} onAgentClick={onViewAgent} />
    </div>
  );
}
```

### Component Checklist

When creating a new component:
- [ ] Export interface for props
- [ ] Add JSDoc comment explaining purpose
- [ ] Use TypeScript for all props
- [ ] Follow naming: `ComponentName.tsx`
- [ ] Place in correct folder (ui/ vs domain/)
- [ ] Keep components under 300 lines
- [ ] Extract sub-components if too large

## 🔧 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State:** React hooks
- **Auth:** Privy
- **Icons:** Lucide React
- **Linting:** ESLint + Prettier

## 🎨 Design System

### Colors
```css
--background: #121212
--surface: #1a1a1a, #1e1e1e
--surface-variant: #2a2a2a, #252525
--primary: #fd6731
--teal: teal-400
--text: white, gray-400, gray-500
```

### Common Patterns
```typescript
// Card
className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6"

// Button Primary
className="px-6 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium"

// Button Secondary
className="px-4 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white"

// Input
className="px-4 py-2.5 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] text-white focus:border-[#fd6731]"
```

## 🧪 Development Guidelines

### Adding a New Route

1. Create folder structure:
```bash
app/
└── new-feature/
    └── page.tsx
```

2. Create page component:
```typescript
// app/new-feature/page.tsx
'use client';

import { NewFeaturePage } from '@/components/NewFeaturePage';

export default function NewFeatureRoute() {
  // Data fetching and business logic
  return <NewFeaturePage />;
}
```

3. Create presentation component:
```typescript
// components/NewFeaturePage.tsx
export function NewFeaturePage() {
  // UI and presentation logic
  return <div>...</div>;
}
```

4. Update AppSidebar navigation if needed

### Working with Agents

```typescript
// Get agent connection
const agent = useAgentConnection(DEFAULT_AGENT_ID);

// Access agent data
agent.config      // Agent configuration
agent.profile     // Agent metrics (AUM, APY, etc.)
agent.isHired     // Hire status
agent.isActive    // Activity status

// Agent actions
agent.runHire()   // Hire the agent
agent.runFire()   // Fire the agent
agent.runSync()   // Sync agent data
```

## 📝 Code Style

- Use `'use client'` directive for client components
- Prefer named exports over default for components
- Use TypeScript interfaces for all props
- Follow existing naming conventions
- Keep files focused (single responsibility)
- Extract reusable logic into hooks

## 🚧 TODO / Future Work

- [ ] Implement Acquire page
- [ ] Implement Leaderboard page
- [ ] Add unit tests for components
- [ ] Set up Storybook for component catalog
- [ ] Add loading states
- [ ] Add error boundaries
- [ ] Implement real-time updates
- [ ] Add agent performance charts

## 🐛 Troubleshooting

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Type Errors
- Ensure all imports use `.js` extension for ESM compatibility
- Check that all hook dependencies are properly typed

## 📚 Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Contributing

When working on this project:
1. Follow the established patterns
2. Keep components small and focused
3. Document complex logic with comments
4. Test changes locally before committing
5. Run `pnpm lint` before committing

For architectural decisions and rationale, see the conversation history or ask the team.
