import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAutocomplete } from '@/hooks/use-autocomplete';
import { AutocompleteSuggestion } from '@/components/autocomplete-suggestion';
import { TokenPicker, type Token } from '@/components/token-picker';
import { ChainPicker, type Chain } from '@/components/chain-picker';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  enableAutocomplete?: boolean;
  onAutocompleteAccept?: (newValue: string) => void;
  onSubmit?: (newValue: string) => void;
}

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, enableAutocomplete = false, onAutocompleteAccept, onSubmit, onChange, value, ...props }, ref) => {
  const [localValue, setLocalValue] = React.useState(value || '');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = React.useState<string>('200px');
  const [openTokenPicker, setOpenTokenPicker] = React.useState<string | null>(null);
  const [openChainPicker, setOpenChainPicker] = React.useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = React.useState<Record<string, Token>>({});
  const [selectedChain, setSelectedChain] = React.useState<Chain | null>(null);
  const [selectedChains, setSelectedChains] = React.useState<Record<string, Chain>>({});

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

      // Auto-focus the textarea after accepting
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const handleAcceptAndSubmit = () => {
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

      // Clear the suggestion first to ensure the textarea is visible
      clearSuggestion();

      // Submit the form after ensuring the text is set
      setTimeout(() => {
        if (onSubmit) {
          onSubmit(newText);
        }
      }, 100);
    }
  };

  const handleRejectSuggestion = () => {
    clearSuggestion();
    // Auto-focus the textarea when autocomplete is hidden
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleTokenSelect = (token: Token) => {
    if (openTokenPicker) {
      setSelectedTokens(prev => ({ ...prev, [openTokenPicker]: token }));
      updateInputValue(openTokenPicker, token.symbol);
      setOpenTokenPicker(null);
      // Focus back to the autocomplete after token selection
      // The AutocompleteSuggestion component will handle focusing the appropriate input
    }
  };

  const handleChainSelect = (chain: Chain) => {
    if (openChainPicker) {
      setSelectedChains(prev => ({ ...prev, [openChainPicker]: chain }));
      updateInputValue(openChainPicker, chain.name);
      setOpenChainPicker(null);
    }
  };

  const handleTokenSelectFromSuggestion = (segmentName: string, token: Token) => {
    setSelectedTokens(prev => ({ ...prev, [segmentName]: token }));
  };

  const handleChainSelectFromSuggestion = (segmentName: string, chain: Chain) => {
    // This will be called from the AutocompleteSuggestion component
    setSelectedChains(prev => ({ ...prev, [segmentName]: chain }));
    updateInputValue(segmentName, chain.name);
  };

  const showAutocomplete = enableAutocomplete && suggestion && suggestion.segments.length > 0;

  // Ensure only one picker is open at a time
  const handleOpenTokenPicker = (name: string | null) => {
    setOpenTokenPicker(name);
    if (name) {
      setOpenChainPicker(null);
    }
  };

  const handleOpenChainPicker = (name: string | null) => {
    setOpenChainPicker(name);
    if (name) {
      setOpenTokenPicker(null);
    }
  };

  return (
    <div>
      {/* Token Picker positioned outside the main box */}
      {openTokenPicker && (
        <div className="relative h-full z-50 mb-3 mt-0">
          <div className="bg-background rounded-lg shadow-xl border-2 border-primary/50 overflow-hidden">
            <TokenPicker
              selectedToken={selectedTokens[openTokenPicker]}
              onSelect={handleTokenSelect}
              onClose={() => handleOpenTokenPicker(null)}
              embedded={true}
            />
          </div>
        </div>
      )}

      {/* Chain Picker positioned outside the main box */}
      {openChainPicker && (
        <div className="relative h-full z-50 mb-3 mt-0">
          <div className="bg-background rounded-lg shadow-xl border-2 border-primary/50 overflow-hidden">
            <ChainPicker
              selectedChain={selectedChains[openChainPicker]}
              onSelect={handleChainSelect}
              onClose={() => setOpenChainPicker(null)}
              embedded={true}
            />
          </div>
        </div>
      )}

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

          <div className="px-3 py-2 h-full flex flex-col">
            <AutocompleteSuggestion
              segments={suggestion?.segments || []}
              inputValues={inputValues}
              onInputChange={updateInputValue}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
              onSubmit={onSubmit}
              className="flex-1"
              showAutocomplete={showAutocomplete}
              onTokenPickerOpen={handleOpenTokenPicker}
              onTokenSelect={handleTokenSelectFromSuggestion}
              onChainPickerOpen={handleOpenChainPicker}
              onChainSelect={handleChainSelectFromSuggestion}
              openTokenPickerName={openTokenPicker}
              isChainPickerOpen={!!openChainPicker}
            />
          </div>
        </div>



      </div>
    </div>

  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
