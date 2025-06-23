import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { AutocompleteSuggestion } from '@/components/autocomplete-suggestion';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  enableAutocomplete?: boolean;
  onAutocompleteAccept?: (newValue: string) => void;
}

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, enableAutocomplete = false, onAutocompleteAccept, onChange, value, ...props }, ref) => {
  const [localValue, setLocalValue] = React.useState(value || '');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = React.useState<string>('auto');

  const combinedRef = React.useMemo(
    () => (node: HTMLTextAreaElement) => {
      textareaRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  // Autocomplete hook
  const {
    suggestion,
    getSuggestion,
    clearSuggestion,
    inputValues,
    updateInputValue,
    acceptSuggestion,
  } = useAutocomplete({ debounceMs: 300, minChars: 3 });

  // Update local value when prop changes
  React.useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  // Capture textarea height before showing autocomplete
  React.useEffect(() => {
    if (textareaRef.current && !suggestion) {
      setTextareaHeight(`${textareaRef.current.scrollHeight}px`);
    }
  }, [localValue, suggestion]);

  // Trigger autocomplete when value changes
  React.useEffect(() => {
    if (enableAutocomplete && localValue && textareaRef.current) {
      const cursorPosition = textareaRef.current.selectionStart || 0;
      getSuggestion(String(localValue), cursorPosition);
    } else {
      clearSuggestion();
    }
  }, [localValue, enableAutocomplete, getSuggestion, clearSuggestion]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (enableAutocomplete && suggestion && suggestion.segments.length > 0) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const newText = acceptSuggestion(String(localValue));
        setLocalValue(newText);

        // Create synthetic event for onChange
        const syntheticEvent = {
          ...e,
          target: { ...e.target, value: newText },
          currentTarget: { ...e.currentTarget, value: newText }
        } as React.ChangeEvent<HTMLTextAreaElement>;

        onChange?.(syntheticEvent);
        onAutocompleteAccept?.(newText);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearSuggestion();
      }
    }

    props.onKeyDown?.(e);
  };

  const handleAcceptSuggestion = () => {
    if (suggestion) {
      const newText = acceptSuggestion(String(localValue));
      setLocalValue(newText);

      // Create synthetic event
      const syntheticEvent = {
        target: textareaRef.current!,
        currentTarget: textareaRef.current!
      } as React.ChangeEvent<HTMLTextAreaElement>;

      if (textareaRef.current) {
        textareaRef.current.value = newText;
      }

      onChange?.(syntheticEvent);
      onAutocompleteAccept?.(newText);
    }
  };

  const handleRejectSuggestion = () => {
    clearSuggestion();
  };

  const showAutocomplete = enableAutocomplete && suggestion && suggestion.segments.length > 0;

  return (
    <div className="w-full">
      <textarea
        className={cn(
          'top-0 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-opacity duration-200',
          showAutocomplete && 'absolute opacity-0 pointer-events-none',
          className,
        )}
        ref={combinedRef}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...props}
      />

      {showAutocomplete && (
        <div
          className=" bg-background rounded-md border-2 border-primary/50 shadow-lg overflow-hidden pb-12"
          style={{ minHeight: textareaHeight }}
        >
          <div className="p-4 h-full flex flex-col">
            <AutocompleteSuggestion
              segments={suggestion.segments}
              inputValues={inputValues}
              onInputChange={updateInputValue}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
