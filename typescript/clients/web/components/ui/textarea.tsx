import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { AutocompleteSuggestion } from '@/components/autocomplete-suggestion';
import { TokenPicker, type Token } from '@/components/token-picker';

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
  const [textareaHeight, setTextareaHeight] = React.useState<string>('200px');
  const [openTokenPicker, setOpenTokenPicker] = React.useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = React.useState<Record<string, Token>>({});

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
      const height = Math.max(200, textareaRef.current.scrollHeight);
      setTextareaHeight(`${height}px`);
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

  const handleTokenSelect = (token: Token) => {
    if (openTokenPicker) {
      setSelectedTokens(prev => ({ ...prev, [openTokenPicker]: token }));
      updateInputValue(openTokenPicker, token.symbol);
      setOpenTokenPicker(null);
    }
  };

  const handleTokenSelectFromSuggestion = (segmentName: string, token: Token) => {
    setSelectedTokens(prev => ({ ...prev, [segmentName]: token }));
  };

  const showAutocomplete = enableAutocomplete && suggestion && suggestion.segments.length > 0;

  return (
    <div className="relative w-full" style={{ minHeight: textareaHeight }}>
      <textarea
        className={cn(
          'absolute inset-0 flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-300 ease-in-out',
          showAutocomplete && 'opacity-0 invisible',
          className,
        )}
        ref={combinedRef}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...props}
      />

      <div
        className={cn(
          "absolute inset-0 bg-background rounded-md border-2 shadow-lg overflow-hidden transition-all duration-300 ease-in-out",
          showAutocomplete ? "opacity-100 visible border-primary/50" : "opacity-0 invisible pointer-events-none border-transparent"
        )}
        style={{ minHeight: textareaHeight }}
      >
        <div className="p-4 h-full flex flex-col">
          <AutocompleteSuggestion
            segments={suggestion?.segments || []}
            inputValues={inputValues}
            onInputChange={updateInputValue}
            onAccept={handleAcceptSuggestion}
            onReject={handleRejectSuggestion}
            className="flex-1"
            showAutocomplete={showAutocomplete}
            onTokenPickerOpen={setOpenTokenPicker}
            onTokenSelect={handleTokenSelectFromSuggestion}
          />
        </div>
      </div>

      {/* Token Picker positioned outside the main box */}
      {openTokenPicker && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50">
          <div className="bg-background rounded-lg shadow-xl border-2 border-primary/50 overflow-hidden">
            <TokenPicker
              selectedToken={selectedTokens[openTokenPicker]}
              onSelect={handleTokenSelect}
              onClose={() => setOpenTokenPicker(null)}
              embedded={true}
            />
          </div>
        </div>
      )}
    </div>
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
