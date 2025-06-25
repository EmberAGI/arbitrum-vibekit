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

interface AutocompleteSuggestionProps {
    segments: AutocompleteSegment[];
    inputValues: Record<string, string>;
    onInputChange: (name: string, value: string) => void;
    onAccept: () => void;
    onReject: () => void;
    className?: string;
    showAutocomplete?: boolean;
    onTokenPickerOpen?: (name: string | null) => void;
    onTokenSelect?: (segmentName: string, token: Token) => void;
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
    className,
    showAutocomplete,
    onTokenPickerOpen,
    onTokenSelect,
}: AutocompleteSuggestionProps) {
    const [openTokenPicker, setOpenTokenPicker] = useState<string | null>(null);
    const [selectedTokens, setSelectedTokens] = useState<Record<string, Token>>({});
    const [tokenSearchValues, setTokenSearchValues] = useState<Record<string, string>>({});
    const [tokenSuggestions, setTokenSuggestions] = useState<Record<string, Token[]>>({});
    const [focusedTokenInput, setFocusedTokenInput] = useState<string | null>(null);

    // Notify parent when token picker state changes
    React.useEffect(() => {
        onTokenPickerOpen?.(openTokenPicker);
    }, [openTokenPicker, onTokenPickerOpen]);

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
            const filtered = mockTokens.filter(token =>
                token.symbol.toLowerCase().includes(value.toLowerCase()) ||
                token.name.toLowerCase().includes(value.toLowerCase())
            );
            setTokenSuggestions(prev => ({ ...prev, [segmentName]: filtered }));
        } else {
            setTokenSuggestions(prev => ({ ...prev, [segmentName]: [] }));
        }
    };

    if (openTokenPicker) {
        return null; // Don't render anything here, parent will handle the token picker
    }

    return (
        <div
            className={cn(
                "flex flex-col justify-start h-full",
                className
            )}
            onKeyDown={handleKeyDown}
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {segments.map((segment, index) => {
                        const isFirstInput = segment.type !== 'text' &&
                            segments.slice(0, index).every(s => s.type === 'text' || !inputValues[s.name || '']);

                        switch (segment.type) {
                            case "text":
                                return (
                                    <span key={segment.id} className="text-base text-foreground/90">
                                        {segment.content}
                                    </span>
                                );

                            case "input-text":
                                return (
                                    <Input
                                        key={segment.id}
                                        type="text"
                                        placeholder={segment.placeholder}
                                        value={inputValues[segment.name || ""] || ""}
                                        onChange={(e) =>
                                            segment.name && onInputChange(segment.name, e.target.value)
                                        }
                                        className={cn(
                                            "inline-flex h-9 w-auto min-w-[80px] max-w-[160px] px-3 text-base",
                                            "bg-primary/10 border-0 rounded-full",
                                            "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                            "placeholder:text-muted-foreground/60"
                                        )}
                                        autoFocus={isFirstInput}
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
                                            className={cn(
                                                "inline-flex h-9 w-auto min-w-[80px] max-w-[160px] text-base",
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
                                const showSuggestions = focusedTokenInput === segmentName && suggestions.length > 0;

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
                                                onClick={() => segment.name && setOpenTokenPicker(segment.name)}
                                                className={cn(
                                                    "inline-flex h-9 w-auto min-w-[80px] max-w-[120px] pl-9 pr-8 text-base",
                                                    "bg-primary/10 border-0 rounded-full",
                                                    "focus:bg-primary/15 focus:ring-2 focus:ring-primary/30",
                                                    "placeholder:text-muted-foreground/60"
                                                )}
                                            />
                                            {selectedToken && (
                                                <div className={cn(
                                                    "absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                                                    selectedToken.color || "bg-gray-500"
                                                )}>
                                                    {selectedToken.icon}
                                                </div>
                                            )}
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                        </div>

                                        {/* Token suggestions dropdown */}
                                        {showSuggestions && (
                                            <div className="absolute top-full mt-1 w-full bg-background rounded-lg shadow-lg border z-50 max-h-48 overflow-y-auto">
                                                {suggestions.map((token) => (
                                                    <button
                                                        key={token.symbol}
                                                        type="button"
                                                        onClick={() => handleTokenSelect(segmentName, token)}
                                                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
                                                    >
                                                        <div className={cn(
                                                            "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold",
                                                            token.color || "bg-gray-500"
                                                        )}>
                                                            {token.icon}
                                                        </div>
                                                        <span className="text-sm font-medium">{token.symbol}</span>
                                                        <span className="text-xs text-muted-foreground ml-auto">{token.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
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