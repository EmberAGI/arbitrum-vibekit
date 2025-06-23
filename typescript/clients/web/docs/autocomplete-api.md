# Autocomplete API Documentation

This document describes the autocomplete functionality implemented for the chat input component.

## Overview

The autocomplete system provides intelligent suggestions as users type, combining static text with dynamic input fields (text boxes and dropdowns) to create structured prompts. When triggered, the suggestion replaces the trigger text directly in the input field.

## Features

- **Inline replacement**: Suggestions replace the trigger text inside the textarea
- **Debounced API calls**: Prevents excessive requests while typing (default: 300ms)
- **Mixed content suggestions**: Combines text fragments with interactive input components
- **Multiple interaction methods**:
  - Press `Tab` to accept the suggestion
  - Press `Esc` to reject the suggestion
  - Click the "Accept" button
  - Click the "Reject" button
  - Press `Enter` while focused on input fields to accept
- **Dynamic rendering**: Automatically renders text, input fields, and select dropdowns based on API response
- **Minimum character threshold**: Suggestions only appear after typing a minimum number of characters (default: 3)
- **Cursor-aware**: Tracks cursor position to properly detect and replace trigger patterns

## API Endpoint

### POST `/api/autocomplete`

#### Request Body
```json
{
  "input": "string - the trigger text that was detected"
}
```

#### Response Format
```typescript
interface AutocompleteResponse {
  segments: AutocompleteSegment[];
  fullText: string; // The complete text with placeholders
}

interface AutocompleteSegment {
  id: string;
  type: 'text' | 'input-text' | 'input-select';
  content?: string;      // For text segments
  placeholder?: string;  // For input segments
  options?: string[];    // For select inputs
  name?: string;         // Input field name for form handling
}
```

## Usage in Components

### 1. Import the hook and component

```typescript
import { useAutocomplete } from "@/hooks/use-autocomplete";
import { AutocompleteSuggestion } from "@/components/autocomplete-suggestion";
```

### 2. Initialize the hook

```typescript
const {
  suggestion,
  isLoading,
  getSuggestion,
  clearSuggestion,
  inputValues,
  updateInputValue,
  buildFinalText,
  acceptSuggestion,
  triggerInfo,
} = useAutocomplete({ 
  debounceMs: 300,  // Debounce delay in milliseconds
  minChars: 3       // Minimum characters before showing suggestions
});
```

### 3. Trigger suggestions on input change with cursor position

```typescript
useEffect(() => {
  if (input.trim() && textareaRef.current) {
    const cursorPosition = textareaRef.current.selectionStart || 0;
    getSuggestion(input, cursorPosition);
  } else {
    clearSuggestion();
  }
}, [input]);
```

### 4. Handle keyboard interactions

```typescript
const handleKeyDown = (event: React.KeyboardEvent) => {
  if (event.key === "Tab" && suggestion) {
    event.preventDefault();
    const newText = acceptSuggestion(input);
    setInput(newText);
  } else if (event.key === "Escape" && suggestion) {
    event.preventDefault();
    clearSuggestion();
  }
};
```

### 5. Render the suggestion component with Accept/Reject handlers

```tsx
{suggestion && suggestion.segments.length > 0 && (
  <AutocompleteSuggestion
    segments={suggestion.segments}
    inputValues={inputValues}
    onInputChange={updateInputValue}
    onAccept={handleAcceptSuggestion}
    onReject={handleRejectSuggestion}
  />
)}
```

## Example Patterns

The mock API currently supports these patterns:

1. **"can you help"** → "Can you help me with [task type dropdown] my [component name input]?"
2. **"i need to"** → "I need to [action dropdown] a [what input] in [where input]"
3. **"please"** → "Please [action dropdown] how to [task description input]"
4. **"how do i"** → "How do I [task input] using [technology dropdown]?"

## User Interaction Flow

1. User types a trigger phrase (e.g., "can you help")
2. After a short delay, the autocomplete suggestion appears above the textarea
3. The suggestion shows the complete pattern with input fields
4. User can:
   - Fill in the input fields and press Enter to accept
   - Press Tab to accept the current state
   - Press Esc to reject and dismiss
   - Click Accept/Reject buttons
5. When accepted, the trigger text in the textarea is replaced with the completed suggestion

## Extending the API

To add new autocomplete patterns:

1. Edit `/app/(chat)/api/autocomplete/route.ts`
2. Add new patterns to the `mockAutocompleteData` object
3. Define the segments array with appropriate types:
   - Use `type: 'text'` for static text
   - Use `type: 'input-text'` for text input fields
   - Use `type: 'input-select'` for dropdown selections

Example:
```typescript
'what is': {
  segments: [
    { id: '1', type: 'text', content: 'What is ' },
    {
      id: '2',
      type: 'input-select',
      placeholder: 'concept',
      name: 'concept',
      options: ['React', 'Next.js', 'TypeScript', 'GraphQL']
    },
    { id: '3', type: 'text', content: ' and how does it relate to ' },
    {
      id: '4',
      type: 'input-text',
      placeholder: 'your context',
      name: 'context'
    },
    { id: '5', type: 'text', content: '?' }
  ],
  fullText: 'What is [concept] and how does it relate to [your context]?'
}
```

## How It Works

The autocomplete functionality is integrated directly into the `multimodal-input` component and will work automatically wherever that component is used. The suggestions appear above the textarea as you type, and when accepted, they replace the trigger text inline, maintaining the context of your message. 