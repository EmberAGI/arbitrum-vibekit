import { useState, useEffect, useCallback, useRef } from 'react';
import type { AutocompleteResponse, AutocompleteSegment } from '@/app/(chat)/api/autocomplete/route';

interface UseAutocompleteOptions {
    debounceMs?: number;
    minChars?: number;
}

interface TriggerInfo {
    startIndex: number;
    endIndex: number;
    triggerText: string;
}

export function useAutocomplete(options: UseAutocompleteOptions = {}) {
    const { debounceMs = 300, minChars = 2 } = options;

    const [suggestion, setSuggestion] = useState<AutocompleteResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [triggerInfo, setTriggerInfo] = useState<TriggerInfo | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout>();
    const abortControllerRef = useRef<AbortController>();

    const fetchSuggestion = useCallback(async (input: string, trigger: TriggerInfo) => {
        if (trigger.triggerText.length < minChars) {
            setSuggestion(null);
            return;
        }

        // Cancel any in-flight requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();
        setIsLoading(true);

        try {
            const response = await fetch('/api/autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ input: trigger.triggerText }),
                signal: abortControllerRef.current.signal,
            });

            if (response.ok) {
                const data: AutocompleteResponse = await response.json();
                setSuggestion(data);
                setTriggerInfo(trigger);
            } else {
                setSuggestion(null);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error('Autocomplete error:', error);
                setSuggestion(null);
            }
        } finally {
            setIsLoading(false);
        }
    }, [minChars]);

    const getSuggestion = useCallback((fullInput: string, cursorPosition: number) => {
        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Find the trigger pattern by looking backwards from cursor
        const textBeforeCursor = fullInput.substring(0, cursorPosition).toLowerCase();

        // Check for trigger patterns - ordered by specificity
        const patterns = ['can you help', 'how do i', 'i need to', 'please', 'swap'];
        let foundTrigger: TriggerInfo | null = null;

        for (const pattern of patterns) {
            // Look for the pattern at the start of the text or after whitespace
            const regex = new RegExp(`(^|\\s)(${pattern})`, 'i');
            const match = textBeforeCursor.match(regex);

            if (match && match.index !== undefined) {
                const startIndex = match.index + match[1].length;
                const endIndex = cursorPosition;

                // Make sure the cursor is at or after the pattern
                if (startIndex + pattern.length <= cursorPosition) {
                    foundTrigger = {
                        startIndex,
                        endIndex: cursorPosition,
                        triggerText: fullInput.substring(startIndex, cursorPosition)
                    };
                    break;
                }
            }
        }

        if (foundTrigger) {
            // Set new timer
            debounceTimerRef.current = setTimeout(() => {
                fetchSuggestion(fullInput, foundTrigger);
            }, debounceMs);
        } else {
            clearSuggestion();
        }
    }, [fetchSuggestion, debounceMs]);

    const clearSuggestion = useCallback(() => {
        setSuggestion(null);
        setInputValues({});
        setTriggerInfo(null);
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const updateInputValue = useCallback((name: string, value: string) => {
        setInputValues(prev => ({ ...prev, [name]: value }));
    }, []);

    const buildFinalText = useCallback((): string => {
        if (!suggestion) return '';

        return suggestion.segments.map(segment => {
            if (segment.type === 'text') {
                return segment.content || '';
            } else if (segment.name) {
                return inputValues[segment.name] || `[${segment.placeholder || '...'}]`;
            }
            return '';
        }).join('');
    }, [suggestion, inputValues]);

    const acceptSuggestion = useCallback((currentInput: string): string => {
        if (!suggestion || !triggerInfo) return currentInput;

        const finalText = buildFinalText();
        const beforeTrigger = currentInput.substring(0, triggerInfo.startIndex);
        const afterTrigger = currentInput.substring(triggerInfo.endIndex);

        clearSuggestion();
        return beforeTrigger + finalText + afterTrigger;
    }, [suggestion, triggerInfo, buildFinalText, clearSuggestion]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        suggestion,
        isLoading,
        getSuggestion,
        clearSuggestion,
        inputValues,
        updateInputValue,
        buildFinalText,
        acceptSuggestion,
        triggerInfo,
    };
} 