"use client";

import { Input } from "./ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Check, X, ChevronDown } from "lucide-react";
import type { AutocompleteSegment } from "@/app/(chat)/api/autocomplete/route";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { TokenPicker, type Token } from "./token-picker";
import * as React from "react";

// Mock tokens for filtering - in real app, this would come from a context or prop
const mockTokens: Token[] = [
    { symbol: "USDC", name: "USD Coin", balance: "5,115242", value: "5,115 US", icon: "💵", color: "bg-blue-500" },
    { symbol: "WETH", name: "WETH", balance: "0.00104", value: "", icon: "Ξ", color: "bg-gray-700" },
    { symbol: "ETH", name: "ETH", balance: "0.000784", value: "1.98 $US", icon: "Ξ", color: "bg-purple-500" },
    { symbol: "aArbWETH", name: "Aave Arbitrum WETH", balance: "0.00014", value: "", icon: "🔺", color: "bg-pink-500" },
    { symbol: "USDT", name: "USDT", balance: "", value: "", icon: "₮", color: "bg-green-500" },
    { symbol: "DAI", name: "DAI Stablecoin", balance: "", value: "", icon: "◈", color: "bg-yellow-500" },
    { symbol: "WBTC", name: "WBTC", balance: "", value: "", icon: "₿", color: "bg-orange-500" },
];

// Mock chain data - in real app, this would come from a context or prop
const mockChains = [
    { id: "arbitrum", name: "Arbitrum One", icon: "A", color: "bg-blue-500" },
    { id: "ethereum", name: "Ethereum", icon: "Ξ", color: "bg-blue-600" },
    { id: "optimism", name: "Optimism", icon: "O", color: "bg-red-500" },
    { id: "base", name: "Base", icon: "B", color: "bg-blue-400" },
    { id: "polygon", name: "Polygon", icon: "P", color: "bg-purple-600" },
    { id: "avalanche", name: "Avalanche", icon: "A", color: "bg-red-600" },
    { id: "bsc", name: "BNB Chain", icon: "B", color: "bg-yellow-500" },
    { id: "gnosis", name: "Gnosis", icon: "G", color: "bg-green-600" },
    { id: "zksync", name: "zkSync Era", icon: "Z", color: "bg-purple-500" },
];

interface AutocompleteSuggestionProps {
    segments: AutocompleteSegment[];
    inputValues: Record<string, string>;
    onInputChange: (name: string, value: string) => void;
    onAccept: () => void;
    onReject: () => void;
    onSubmit?: (finalText: string) => void;
    className?: string;
    showAutocomplete?: boolean;
    onTokenPickerOpen?: (name: string | null) => void;
    onTokenSelect?: (segmentName: string, token: Token) => void;
    onChainPickerOpen?: (name: string | null) => void;
    onChainSelect?: (segmentName: string, chain: typeof mockChains[0]) => void;
    openTokenPickerName?: string | null;
    isChainPickerOpen?: boolean;
}

export interface TokenPickerState {
    openTokenPicker: string | null;
    selectedTokens: Record<string, Token>;
}

export function AutocompleteSuggestion({
    segments,
    inputValues,
    onInputChange,
    onAccept,
    onReject,
    onSubmit,
    className,
    showAutocomplete,
    onTokenPickerOpen,
    onTokenSelect,
    onChainPickerOpen,
    onChainSelect,
    openTokenPickerName,
    isChainPickerOpen,
}: AutocompleteSuggestionProps) {
    const [openTokenPicker, setOpenTokenPicker] = useState<string | null>(null);
    const [selectedTokens, setSelectedTokens] = useState<Record<string, Token>>({});
    const [tokenSearchValues, setTokenSearchValues] = useState<Record<string, string>>({});
    const [tokenSuggestions, setTokenSuggestions] = useState<Record<string, Token[]>>({});
    const [focusedTokenInput, setFocusedTokenInput] = useState<string | null>(null);
    const [openChainPicker, setOpenChainPicker] = useState<string | null>(null);
    const [selectedChains, setSelectedChains] = useState<Record<string, typeof mockChains[0]>>({});
    const [chainSearchValues, setChainSearchValues] = useState<Record<string, string>>({});
    const [chainSuggestions, setChainSuggestions] = useState<Record<string, typeof mockChains>>({});
    const [focusedChainInput, setFocusedChainInput] = useState<string | null>(null);

    const handleSubmit = (finalSegmentName: string, finalSegmentValue: string) => {
        // It's important to still call onInputChange to let the parent hook know
        // about the final value, so it can update its state for any other consumers.
        onInputChange(finalSegmentName, finalSegmentValue);

        // However, we'll build the final string immediately using a local snapshot
        // of the input values, preventing any race conditions with state updates.
        const finalInputValues = {
            ...inputValues,
            [finalSegmentName]: finalSegmentValue,
        };

        const finalText = segments.map(segment => {
            if (segment.type === 'text') {
                return segment.content || '';
            } else if (segment.name) {
                return finalInputValues[segment.name] || '';
            }
            return '';
        }).join('');

        if (onSubmit) {
            onSubmit(finalText);
        } else {
            onAccept();
        }
    };

    // Sync tokenSearchValues and chainSearchValues with inputValues when they change
    React.useEffect(() => {
        // Update token search values for token-picker segments
        segments.forEach(segment => {
            if (segment.type === 'token-picker' && segment.name) {
                const currentValue = inputValues[segment.name] || '';
                setTokenSearchValues((prev: Record<string, string>) => {
                    if (prev[segment.name!] !== currentValue) {
                        return { ...prev, [segment.name!]: currentValue };
                    }
                    return prev;
                });

                // Also update selected token if value matches a token
                const matchingToken = mockTokens.find(t => t.symbol === currentValue);
                if (matchingToken) {
                    setSelectedTokens((prev: Record<string, Token>) => ({ ...prev, [segment.name!]: matchingToken }));
                }
            } else if (segment.type === 'chain-picker' && segment.name) {
                const currentValue = inputValues[segment.name] || '';
                setChainSearchValues((prev: Record<string, string>) => {
                    if (prev[segment.name!] !== currentValue) {
                        return { ...prev, [segment.name!]: currentValue };
                    }
                    return prev;
                });

                // Also update selected chain if value matches a chain
                const matchingChain = mockChains.find(c => c.name === currentValue);
                if (matchingChain) {
                    setSelectedChains((prev: Record<string, typeof mockChains[0]>) => ({ ...prev, [segment.name!]: matchingChain }));
                }
            }
        });
    }, [inputValues, segments]);

    // Auto-focus first input when component mounts
    React.useEffect(() => {
        if (!showAutocomplete) return;

        const timer = setTimeout(() => {
            // Find the first input element
            const firstInputElement = segments.find(s =>
                s.type === 'input-text' || s.type === 'token-picker' ||
                s.type === 'input-select' || s.type === 'chain-picker'
            );

            if (firstInputElement && firstInputElement.name) {
                const inputEl = document.querySelector(`[data-segment-name="${firstInputElement.name}"]`) as HTMLInputElement;
                if (inputEl) {
                    inputEl.focus();
                    // For token/chain pickers, also set the cursor position
                    if (inputEl.setSelectionRange) {
                        const len = inputEl.value.length;
                        inputEl.setSelectionRange(len, len);
                    }
                }
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [showAutocomplete, segments]);

    // Use parent-controlled state if available, otherwise use local state
    const activeTokenPicker = openTokenPickerName !== undefined ? openTokenPickerName : openTokenPicker;
    const activeChainPicker = isChainPickerOpen !== undefined ? (isChainPickerOpen ? openChainPicker : null) : openChainPicker;

    // Notify parent when token picker state changes
    React.useEffect(() => {
        if (openTokenPickerName === undefined) {
            onTokenPickerOpen?.(openTokenPicker);
        }
    }, [openTokenPicker, onTokenPickerOpen, openTokenPickerName]);

    // Notify parent when chain picker state changes
    React.useEffect(() => {
        if (isChainPickerOpen === undefined && openChainPicker) {
            onChainPickerOpen?.(openChainPicker);
        }
    }, [openChainPicker, onChainPickerOpen, isChainPickerOpen]);

    // Handle closing token picker from parent
    React.useEffect(() => {
        // If parent says no token picker is open, clear our state too
        if (onTokenPickerOpen && !openTokenPicker) {
            setOpenTokenPicker(null);
        }
    }, [onTokenPickerOpen]);

    // Export the state through a ref that parent can access
    React.useImperativeHandle(
        React.useRef<TokenPickerState>(),
        () => ({
            openTokenPicker,
            selectedTokens,
        }),
        [openTokenPicker, selectedTokens]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onAccept();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onReject();
        }
    };

    // Check if the current segment is the last input
    const isLastInput = (segmentName: string) => {
        const inputSegments = segments.filter(s =>
            s.type === 'input-text' || s.type === 'token-picker' ||
            s.type === 'input-select' || s.type === 'chain-picker'
        );
        const lastInput = inputSegments[inputSegments.length - 1];
        return lastInput?.name === segmentName;
    };

    const handleTokenSelect = (segmentName: string, token: Token) => {
        setSelectedTokens(prev => ({ ...prev, [segmentName]: token }));
        onInputChange(segmentName, token.symbol);
        setTokenSearchValues(prev => ({ ...prev, [segmentName]: token.symbol }));
        setOpenTokenPicker(null);
        setFocusedTokenInput(null);
        setTokenSuggestions(prev => ({ ...prev, [segmentName]: [] }));

        // Notify parent about token selection
        onTokenSelect?.(segmentName, token);
    };

    const handleTokenInputChange = (segmentName: string, value: string) => {
        setTokenSearchValues(prev => ({ ...prev, [segmentName]: value }));
        onInputChange(segmentName, value);

        // Filter tokens based on input
        if (value.trim()) {
            const searchLower = value.toLowerCase().trim();
            const filtered = mockTokens
                .filter(token =>
                    token.symbol.toLowerCase().startsWith(searchLower) ||
                    token.name.toLowerCase().includes(searchLower)
                )
                .sort((a, b) => {
                    // Prioritize exact prefix matches for symbols
                    const aStartsWithSymbol = a.symbol.toLowerCase().startsWith(searchLower);
                    const bStartsWithSymbol = b.symbol.toLowerCase().startsWith(searchLower);

                    if (aStartsWithSymbol && !bStartsWithSymbol) return -1;
                    if (!aStartsWithSymbol && bStartsWithSymbol) return 1;

                    // Then sort by symbol length (shorter first)
                    return a.symbol.length - b.symbol.length;
                });
            setTokenSuggestions(prev => ({ ...prev, [segmentName]: filtered }));
        } else {
            setTokenSuggestions(prev => ({ ...prev, [segmentName]: [] }));
        }
    };

    const handleChainSelect = (segmentName: string, chain: typeof mockChains[0]) => {
        setSelectedChains(prev => ({ ...prev, [segmentName]: chain }));
        onInputChange(segmentName, chain.name);
        setChainSearchValues(prev => ({ ...prev, [segmentName]: chain.name }));
        setOpenChainPicker(null);
        setFocusedChainInput(null);
        setChainSuggestions(prev => ({ ...prev, [segmentName]: [] }));

        // Notify parent about chain selection
        onChainSelect?.(segmentName, chain);
    };

    const handleChainInputChange = (segmentName: string, value: string) => {
        setChainSearchValues(prev => ({ ...prev, [segmentName]: value }));
        onInputChange(segmentName, value);

        // Filter chains based on input
        if (value.trim()) {
            const searchLower = value.toLowerCase().trim();
            const filtered = mockChains
                .filter(chain =>
                    chain.name.toLowerCase().startsWith(searchLower) ||
                    chain.id.toLowerCase().startsWith(searchLower)
                )
                .sort((a, b) => {
                    // Prioritize exact prefix matches for names
                    const aStartsWithName = a.name.toLowerCase().startsWith(searchLower);
                    const bStartsWithName = b.name.toLowerCase().startsWith(searchLower);

                    if (aStartsWithName && !bStartsWithName) return -1;
                    if (!aStartsWithName && bStartsWithName) return 1;

                    // Then sort by name length (shorter first)
                    return a.name.length - b.name.length;
                });
            setChainSuggestions(prev => ({ ...prev, [segmentName]: filtered }));
        } else {
            setChainSuggestions(prev => ({ ...prev, [segmentName]: [] }));
        }
    };

    return (
        <div
            className={cn(
                "flex flex-col justify-start h-full",
                className
            )}
            onKeyDown={handleKeyDown}
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    {segments.map((segment, index) => {
                        switch (segment.type) {
                            case "text":
                                return (
                                    <span key={segment.id} className="text-base text-foreground/90">
                                        {segment.content}
                                    </span>
                                );

                            case "input-text":
                                const isAmountInput = segment.placeholder?.toLowerCase().includes('amount') ||
                                    segment.name?.toLowerCase().includes('amount');
                                return (
                                    <Input
                                        key={segment.id}
                                        type="text"
                                        placeholder={segment.placeholder}
                                        value={inputValues[segment.name || ""] || ""}
                                        onChange={(e) =>
                                            segment.name && onInputChange(segment.name, e.target.value)
                                        }
                                        data-segment-name={segment.name}
                                        className={cn(
                                            "inline-flex h-6 text-base",
                                            "bg-primary/10 border-0 rounded-full",
                                            "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                            "placeholder:text-muted-foreground/60",
                                            isAmountInput
                                                ? "w-auto min-w-[60px] max-w-[80px] px-3"
                                                : "w-auto min-w-[100px] max-w-[160px] px-3"
                                        )}
                                        onKeyDown={(e) => {
                                            if ((e.key === 'Tab' || e.key === 'Enter') && isLastInput(segment.name || '')) {
                                                e.preventDefault();
                                                handleSubmit(segment.name!, e.currentTarget.value);
                                            }
                                        }}
                                    />
                                );

                            case "input-select":
                                return (
                                    <Select
                                        key={segment.id}
                                        value={inputValues[segment.name || ""] || ""}
                                        onValueChange={(value) =>
                                            segment.name && onInputChange(segment.name, value)
                                        }
                                    >
                                        <SelectTrigger
                                            data-segment-name={segment.name}
                                            className={cn(
                                                "inline-flex h-6 w-auto min-w-[100px] max-w-[140px] px-3 text-base",
                                                "bg-primary/10 border-0 rounded-full",
                                                "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                                "data-[placeholder]:text-muted-foreground/60"
                                            )}
                                        >
                                            <SelectValue placeholder={segment.placeholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {segment.options?.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                    {option}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                );

                            case "token-picker":
                                const segmentName = segment.name || "";
                                const selectedToken = selectedTokens[segmentName];
                                const searchValue = tokenSearchValues[segmentName] || "";
                                const suggestions = tokenSuggestions[segmentName] || [];
                                const bestSuggestion = suggestions.length > 0 ? suggestions[0] : null;

                                // Improved matching logic for inline suggestion
                                const showInlineSuggestion = focusedTokenInput === segmentName &&
                                    bestSuggestion &&
                                    searchValue.length > 0 &&
                                    bestSuggestion.symbol.toLowerCase().startsWith(searchValue.toLowerCase());

                                const handleTokenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                                    if ((e.key === 'Tab' || e.key === 'Enter') && bestSuggestion && showInlineSuggestion) {
                                        e.preventDefault();
                                        handleTokenSelect(segmentName, bestSuggestion);

                                        // If this is the last input, accept the entire autocomplete
                                        if (isLastInput(segmentName)) {
                                            handleSubmit(segmentName, bestSuggestion.symbol);
                                            return;
                                        }

                                        // Find and focus next input
                                        const currentIndex = segments.findIndex(s => s.name === segmentName);
                                        const nextInputSegment = segments.slice(currentIndex + 1).find(s =>
                                            s.type === 'input-text' || s.type === 'token-picker' || s.type === 'input-select' || s.type === 'chain-picker'
                                        );

                                        if (nextInputSegment && nextInputSegment.name) {
                                            setTimeout(() => {
                                                const nextInput = document.querySelector(`[data-segment-name="${nextInputSegment.name}"]`) as HTMLInputElement;
                                                if (nextInput) {
                                                    nextInput.focus();
                                                    // Don't trigger click - just focus
                                                }
                                            }, 50);
                                        }
                                    } else if ((e.key === 'Tab' || e.key === 'Enter') && isLastInput(segmentName) && !showInlineSuggestion) {
                                        // If on last input with no suggestion, accept the autocomplete
                                        e.preventDefault();
                                        handleSubmit(segmentName, e.currentTarget.value);
                                    }
                                };

                                return (
                                    <div key={segment.id} className="relative inline-block">
                                        <div className="relative">
                                            <Input
                                                type="text"
                                                placeholder={segment.placeholder}
                                                value={searchValue}
                                                onChange={(e) => handleTokenInputChange(segmentName, e.target.value)}
                                                onFocus={() => setFocusedTokenInput(segmentName)}
                                                onBlur={() => setTimeout(() => setFocusedTokenInput(null), 200)}
                                                onClick={() => {
                                                    if (segment.name) {
                                                        if (openTokenPickerName !== undefined) {
                                                            onTokenPickerOpen?.(segment.name);
                                                        } else {
                                                            setOpenTokenPicker(segment.name);
                                                        }
                                                    }
                                                }}
                                                onKeyDown={handleTokenKeyDown}
                                                data-segment-name={segment.name}
                                                className={cn(
                                                    "inline-flex h-6 w-auto min-w-[120px] max-w-[160px] pl-8 pr-7 text-base",
                                                    "bg-primary/10 border-0 rounded-full",
                                                    "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                                    "placeholder:text-muted-foreground/60"
                                                )}
                                            />
                                            {selectedToken && (
                                                <div className={cn(
                                                    "absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                                                    selectedToken.color || "bg-gray-500"
                                                )}>
                                                    {selectedToken.icon}
                                                </div>
                                            )}
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />

                                            {/* Inline autocomplete suggestion */}
                                            {showInlineSuggestion && bestSuggestion && (
                                                <div className="absolute inset-0 pointer-events-none flex items-center pl-8 pr-7">
                                                    <span className="text-base">
                                                        <span className="invisible">{searchValue}</span>
                                                        <span className="text-muted-foreground/40">
                                                            {bestSuggestion.symbol.slice(searchValue.length)}
                                                        </span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );

                            case "chain-picker":
                                const chainSegmentName = segment.name || "";
                                const selectedChain = selectedChains[chainSegmentName];
                                const chainSearchValue = chainSearchValues[chainSegmentName] || "";
                                const chainSuggestionsList = chainSuggestions[chainSegmentName] || [];
                                const bestChainSuggestion = chainSuggestionsList.length > 0 ? chainSuggestionsList[0] : null;
                                const showChainInlineSuggestion = focusedChainInput === chainSegmentName &&
                                    bestChainSuggestion &&
                                    chainSearchValue.length > 0 &&
                                    bestChainSuggestion.name.toLowerCase().startsWith(chainSearchValue.toLowerCase());

                                const handleChainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                                    if ((e.key === 'Tab' || e.key === 'Enter') && bestChainSuggestion && showChainInlineSuggestion) {
                                        e.preventDefault();
                                        handleChainSelect(chainSegmentName, bestChainSuggestion);

                                        // If this is the last input, accept the entire autocomplete
                                        if (isLastInput(chainSegmentName)) {
                                            handleSubmit(chainSegmentName, bestChainSuggestion.name);
                                            return;
                                        }

                                        // Find and focus next input
                                        const currentIndex = segments.findIndex(s => s.name === chainSegmentName);
                                        const nextInputSegment = segments.slice(currentIndex + 1).find(s =>
                                            s.type === 'input-text' || s.type === 'token-picker' || s.type === 'input-select' || s.type === 'chain-picker'
                                        );

                                        if (nextInputSegment && nextInputSegment.name) {
                                            setTimeout(() => {
                                                const nextInput = document.querySelector(`[data-segment-name="${nextInputSegment.name}"]`) as HTMLInputElement;
                                                if (nextInput) {
                                                    nextInput.focus();
                                                    // Don't trigger click - just focus
                                                }
                                            }, 50);
                                        }
                                    } else if ((e.key === 'Tab' || e.key === 'Enter') && isLastInput(chainSegmentName) && !showChainInlineSuggestion) {
                                        // If on last input with no suggestion, accept the autocomplete
                                        e.preventDefault();
                                        handleSubmit(chainSegmentName, e.currentTarget.value);
                                    }
                                };

                                return (
                                    <div key={segment.id} className="relative inline-block">
                                        <div className="relative">
                                            <Input
                                                type="text"
                                                placeholder={segment.placeholder}
                                                value={chainSearchValue}
                                                onChange={(e) => handleChainInputChange(chainSegmentName, e.target.value)}
                                                onFocus={() => setFocusedChainInput(chainSegmentName)}
                                                onBlur={() => setTimeout(() => setFocusedChainInput(null), 200)}
                                                onClick={() => {
                                                    if (segment.name) {
                                                        if (isChainPickerOpen !== undefined) {
                                                            onChainPickerOpen?.(segment.name);
                                                        } else {
                                                            setOpenChainPicker(segment.name);
                                                        }
                                                    }
                                                }}
                                                onKeyDown={handleChainKeyDown}
                                                data-segment-name={segment.name}
                                                className={cn(
                                                    "inline-flex h-6 w-auto min-w-[120px] max-w-[160px] pl-8 pr-7 text-base",
                                                    "bg-primary/10 border-0 rounded-full",
                                                    "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                                    "placeholder:text-muted-foreground/60"
                                                )}
                                            />
                                            {selectedChain && (
                                                <div className={cn(
                                                    "absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                                                    selectedChain.color || "bg-gray-500"
                                                )}>
                                                    {selectedChain.icon}
                                                </div>
                                            )}
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />

                                            {/* Inline autocomplete suggestion */}
                                            {showChainInlineSuggestion && bestChainSuggestion && (
                                                <div className="absolute inset-0 pointer-events-none flex items-center pl-8 pr-7">
                                                    <span className="text-base">
                                                        <span className="invisible">{chainSearchValue}</span>
                                                        <span className="text-muted-foreground/40">
                                                            {bestChainSuggestion.name.slice(chainSearchValue.length)}
                                                        </span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );

                            default:
                                return null;
                        }
                    })}
                </div>


            </div>

            <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Tab</kbd> or{" "}
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Enter</kbd> to accept •{" "}
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Esc</kbd> to cancel
                </div>


            </div>
        </div>
    );
} 