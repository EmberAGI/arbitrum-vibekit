# Splash Screen Fix

## Problem

The splash screen was flashing briefly on app load and then immediately disappearing. This created a poor user experience where users couldn't properly see the welcome screen.

## Root Cause

The `showSplash` state was initialized to `false`:

```typescript
const [showSplash, setShowSplash] = useState(false);
```

Since sessions are automatically created or loaded from localStorage on mount, there was always an `activeSession`, but the splash screen logic was checking:

```typescript
{
  showSplash || !activeSession ? <SplashScreen /> : <ChatView />;
}
```

This meant:

- `showSplash` was `false` (initial state)
- `!activeSession` was `false` (session exists)
- Result: `false || false = false` → Splash screen never shown

## Solution

### 1. Initialize Splash to True

Changed the initial state to show the splash screen by default:

```typescript
const [showSplash, setShowSplash] = useState(true);
```

### 2. Add Smart Visibility Logic

Added a `useEffect` that automatically manages splash screen visibility based on message count:

```typescript
useEffect(() => {
  if (activeSession && activeSession.messages.length > 0) {
    setShowSplash(false);
  } else if (
    activeSession &&
    activeSession.messages.length === 0 &&
    !showSplash
  ) {
    setShowSplash(true);
  }
}, [activeSession?.messages.length, activeSession?.id]);
```

This ensures:

- Splash is hidden when there are messages
- Splash is shown when session is empty
- Splash updates when switching between sessions

### 3. Update Session Switching Logic

Modified `handleSwitchSession` to check if the target session has messages:

```typescript
const handleSwitchSession = useCallback(
  (sessionId: string) => {
    switchSession(sessionId);

    // Check if the session we're switching to has messages
    const targetSession = sessions[sessionId];
    if (targetSession && targetSession.messages.length === 0) {
      setShowSplash(true);
    } else {
      setShowSplash(false);
    }

    // ... reconnection logic
  },
  [
    /* dependencies */
  ]
);
```

### 4. Update New Session Creation

When creating a new session, explicitly show the splash screen:

```typescript
const handleCreateSession = () => {
  const newSessionId = createSession({
    type: "conversation",
    title: "New Conversation",
  });
  // New sessions have no messages, so show splash
  setShowSplash(true);
};
```

### 5. Simplify Session Closing

Let the `useEffect` handle splash visibility after closing a session:

```typescript
const handleCloseSession = (sessionId: string) => {
  closeSession(sessionId);
  // Note: After closing, useEffect will handle showing splash if needed
};
```

## Behavior After Fix

### On App Load

1. `showSplash` starts as `true`
2. If active session has messages → useEffect hides splash
3. If active session is empty → splash remains visible ✓

### On First Message

1. User types and sends a message
2. Message is added to session
3. useEffect detects `messages.length > 0`
4. Splash is hidden, chat view is shown ✓

### On Session Switch

1. User clicks different session tab
2. Check if target session has messages
3. Show splash if empty, hide if has messages ✓

### On New Session Creation

1. User creates new session
2. New session has no messages
3. Splash is shown ✓
4. First message hides it ✓

### On Session Close

1. User closes a session
2. App switches to another session (or creates new one)
3. useEffect checks message count
4. Splash visibility updates accordingly ✓

## Testing

### Test Case 1: Fresh App Load

1. Clear localStorage
2. Refresh page
3. ✓ Splash screen should be visible
4. Send a message
5. ✓ Splash screen should disappear

### Test Case 2: App Load with Existing Messages

1. Have sessions with messages in localStorage
2. Refresh page
3. ✓ Splash screen should be hidden
4. Active session should show chat view

### Test Case 3: Switch to Empty Session

1. Create a new session (empty)
2. Switch to a session with messages
3. Switch back to the empty session
4. ✓ Splash screen should be visible

### Test Case 4: Multiple Sessions

1. Create multiple sessions
2. Some with messages, some without
3. Switch between them
4. ✓ Splash appears only for empty sessions

## Benefits

1. **No Flash**: Splash screen properly displays on app load
2. **Context-Aware**: Shows splash only when session is empty
3. **Smooth UX**: No jarring transitions
4. **Automatic**: useEffect handles most cases automatically
5. **Consistent**: Same behavior across all session operations

## Files Modified

- `src/app/page.tsx`: Fixed splash screen state and logic
