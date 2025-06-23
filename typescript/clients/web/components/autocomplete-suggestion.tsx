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
import { useState } from "react";
import { TokenPicker, type Token } from "./token-picker";

interface AutocompleteSuggestionProps {
    segments: AutocompleteSegment[];
    inputValues: Record<string, string>;
    onInputChange: (name: string, value: string) => void;
    onAccept: () => void;
    onReject: () => void;
    className?: string;
}

export function AutocompleteSuggestion({
    segments,
    inputValues,
    onInputChange,
    onAccept,
    onReject,
    className,
}: AutocompleteSuggestionProps) {
    const [openTokenPicker, setOpenTokenPicker] = useState<string | null>(null);
    const [selectedTokens, setSelectedTokens] = useState<Record<string, Token>>({});

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
        setOpenTokenPicker(null);
    };

    if (openTokenPicker) {
        return (
            <div className={cn("h-full", className)}>
                <TokenPicker
                    selectedToken={selectedTokens[openTokenPicker]}
                    onSelect={(token) => handleTokenSelect(openTokenPicker, token)}
                    onClose={() => setOpenTokenPicker(null)}
                    embedded={true}
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex flex-col justify-between h-full",
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
                                            "inline-flex h-9 w-auto min-w-[160px] max-w-[280px] px-3 text-base",
                                            "bg-primary/5 border-2 border-primary/30",
                                            "focus:border-primary focus:bg-background",
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
                                                "inline-flex h-9 w-auto min-w-[160px] max-w-[280px] text-base",
                                                "bg-primary/5 border-2 border-primary/30",
                                                "focus:border-primary focus:bg-background",
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
                                const selectedToken = selectedTokens[segment.name || ""];
                                return (
                                    <button
                                        key={segment.id}
                                        type="button"
                                        onClick={() => segment.name && setOpenTokenPicker(segment.name)}
                                        className={cn(
                                            "inline-flex h-9 items-center gap-2 px-3 text-base rounded-md",
                                            "min-w-[160px] max-w-[280px]",
                                            "bg-primary/5 border-2 border-primary/30",
                                            "hover:border-primary hover:bg-primary/10 transition-colors",
                                            "focus:outline-none focus:border-primary focus:bg-background"
                                        )}
                                    >
                                        {selectedToken ? (
                                            <>
                                                <div className={cn(
                                                    "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold",
                                                    selectedToken.color || "bg-gray-500"
                                                )}>
                                                    {selectedToken.icon}
                                                </div>
                                                <span className="font-medium">{selectedToken.symbol}</span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground/60">{segment.placeholder}</span>
                                        )}
                                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
                                    </button>
                                );

                            default:
                                return null;
                        }
                    })}
                </div>

                <div className="text-xs text-muted-foreground/70 mt-2">
                    Fill in the highlighted fields to complete your message
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Tab</kbd> or{" "}
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Enter</kbd> to accept •{" "}
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">Esc</kbd> to cancel
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="default"
                        className="h-8 px-4"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onAccept();
                        }}
                    >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Accept
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-4"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onReject();
                        }}
                    >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
} 