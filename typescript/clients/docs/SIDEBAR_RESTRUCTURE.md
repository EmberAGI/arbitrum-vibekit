# Sidebar Restructure

## Overview

The sidebar has been reorganized to improve information hierarchy and user experience. Key changes include moving system-level controls to the bottom and grouping related settings together.

## Changes Made

### 1. Documentation Organization

All documentation markdown files have been moved to a `docs/` folder:

```
docs/
├── A2A_RECONNECTION_FEATURE.md
├── APPEND_LOGIC_DIAGRAM.md
├── BIDIRECTIONAL_COMMUNICATION.md
├── BIDIRECTIONAL_CORRECTIONS_SUMMARY.md
├── BIDIRECTIONAL_FINAL_UPDATE.md
├── BIDIRECTIONAL_IMPLEMENTATION_SUMMARY.md
├── BIDIRECTIONAL_QUICK_START.md
├── BIDIRECTIONAL_UPDATED_FLOW.md
├── EMPTY_ARTIFACT_FIX.md
├── MULTI_ARTIFACT_SUPPORT.md
├── MULTI_ARTIFACT_TEST_CASES.md
├── MULTI_SESSION_ARCHITECTURE.md
├── MULTI_TYPE_APPEND_CONFIRMED.md
├── SIDEBAR_IMPLEMENTATION_SUMMARY.md
├── SIDEBAR_SESSION_FILTERING.md
└── SIDEBAR_RESTRUCTURE.md (this file)
```

### 2. Sidebar Layout Restructure

#### New Layout

```
┌─────────────────────────────────┐
│ Header (Logo + EmberAi)         │
├─────────────────────────────────┤
│ Agent Activity                  │
│ ▼ Action required               │
│   - Sessions needing attention  │
│ ▼ Live                          │
│   - Active sessions             │
│ + New Session                   │
│                                 │
│ ▼ MCP Resources (if connected)  │
│   - Prompts                     │
│   - Resources                   │
├─────────────────────────────────┤
│ Bottom Section:                 │
│ ▼ Settings (collapsible)        │
│   - Show/Hide Settings Panel    │
│   - Show/Hide Connection Panel  │
│                                 │
│ Connections                     │
│   - A2A: Connected             │
│   - MCP: Connected             │
│                                 │
│ Debug Console                   │
│   [Badge count]                 │
│                                 │
│ [Wallet Connect Button]         │
└─────────────────────────────────┘
```

### 3. Specific Changes

#### Before

- Connections section was in the middle of the scrollable area
- Settings toggle was a standalone button
- Connection Panel toggle was nested under Connections
- Debug Console was in the scrollable area
- Layout felt cluttered and hierarchically unclear

#### After

- **Connections moved to bottom** - System-level information at the bottom
- **Debug Console moved to bottom** - Developer tools at the bottom
- **Settings consolidated** - New collapsible Settings section with both panel toggles:
  - Show/Hide Settings Panel
  - Show/Hide Connection Panel
- **Cleaner hierarchy** - Sessions and activity at top, system controls at bottom

### 4. Settings Accordion

The Settings section is now a collapsible accordion that contains:

```tsx
<div>
  <button onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}>
    <Settings icon />
    Settings
    <ChevronDown/Right />
  </button>
  {isSettingsExpanded && (
    <div>
      <Button onClick={onShowSettings}>
        Show/Hide Settings Panel
      </Button>
      <Button onClick={onShowConnection}>
        Show/Hide Connection Panel
      </Button>
    </div>
  )}
</div>
```

**Benefits:**

- Groups related controls together
- Saves vertical space when collapsed
- Clear distinction between panel toggles and other controls

### 5. Bottom Section Organization

The bottom section now has a consistent structure:

1. **Settings** (collapsible)

   - Panel visibility toggles

2. **Connections** (always visible)

   - Connection status indicators
   - Compact display of A2A and MCP status

3. **Debug Console** (button)

   - One-click access
   - Badge shows log count

4. **Wallet Connect** (always visible)
   - Primary user action

## User Experience Improvements

### Visual Hierarchy

**Top Section (Scrollable):**

- Task-focused: Sessions requiring attention
- Active work: Live sessions
- Quick actions: New session, MCP resources

**Bottom Section (Fixed):**

- System controls: Settings, Connections, Debug
- User account: Wallet connection

### Benefits

1. **Better Organization**

   - Tasks and activity at top (primary focus)
   - System controls at bottom (secondary access)

2. **Reduced Scrolling**

   - System controls always visible at bottom
   - No need to scroll to access debug or wallet

3. **Cleaner Layout**

   - Settings consolidated into one section
   - Related controls grouped together
   - Less visual clutter

4. **Improved Usability**
   - Panel toggles in one place
   - Connection status always visible
   - Debug console easily accessible

## Technical Implementation

### State Management

Removed `isConnectionExpanded` state, added `isSettingsExpanded`:

```typescript
const [isCapabilitiesExpanded, setIsCapabilitiesExpanded] = useState(false);
const [isActionRequiredExpanded, setIsActionRequiredExpanded] = useState(true);
const [isLiveExpanded, setIsLiveExpanded] = useState(true);
const [isSettingsExpanded, setIsSettingsExpanded] = useState(false); // NEW
```

### Component Structure

```tsx
<div className="flex flex-col h-full">
  {/* Header */}
  <div className="p-4">...</div>

  {/* Main Section (Scrollable) */}
  <div className="flex-1 overflow-y-auto p-4">
    {/* Agent Activity */}
    {/* Action Required Sessions */}
    {/* Live Sessions */}
    {/* New Session Button */}
    {/* MCP Resources */}
  </div>

  {/* Bottom Section (Fixed) */}
  <div className="p-4 space-y-3" style={{ borderTop: "1px solid..." }}>
    {/* Settings Accordion */}
    {/* Connections Status */}
    {/* Debug Console */}
    {/* Wallet Connect */}
  </div>
</div>
```

## Files Modified

1. **`src/components/AppSidebar.tsx`**

   - Restructured layout
   - Moved sections to bottom
   - Created Settings accordion
   - Updated state management

2. **Documentation files**
   - Moved all `.md` files to `docs/` folder

## Migration Notes

No breaking changes to props or functionality. The component maintains the same interface:

```typescript
interface AppSidebarProps {
  isA2AConnected: boolean;
  isA2AConnecting: boolean;
  mcpConnectionStatus: string;
  mcpPromptsCount: number;
  mcpResourcesCount: number;
  onShowConnection: () => void;
  onShowSettings: () => void;
  showConnection: boolean;
  showSettings: boolean;
  onShowDebug: () => void;
  debugLogsCount: number;
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  sessionOrder: string[];
  onSwitchSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCreateSession: () => void;
}
```

## Testing Checklist

- [ ] Sessions display correctly in Agent Activity section
- [ ] Settings accordion expands/collapses
- [ ] Settings Panel toggle works
- [ ] Connection Panel toggle works
- [ ] Connection status displays correctly
- [ ] Debug Console opens with click
- [ ] Wallet Connect button works
- [ ] MCP Resources section displays when connected
- [ ] Bottom section remains visible (not scrolled off)
- [ ] Scrolling works smoothly in main section

## Summary

✅ **Documentation organized** - All docs in `docs/` folder  
✅ **Better hierarchy** - Tasks at top, system controls at bottom  
✅ **Settings consolidated** - Panel toggles in one accordion  
✅ **Fixed bottom section** - Always visible system controls  
✅ **Improved UX** - Cleaner, more intuitive layout

The sidebar now provides a more organized and user-friendly interface with clear separation between task management and system controls.
