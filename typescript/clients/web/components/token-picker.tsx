"use client";

import { useState } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export interface Token {
    symbol: string;
    name: string;
    balance: string;
    value: string;
    icon: string;
    color?: string;
}

interface TokenPickerProps {
    onSelect?: (token: Token) => void;
    onClose?: () => void;
    selectedToken?: Token;
    embedded?: boolean;
}

// Mock token data
const mockTokens: Token[] = [
    { symbol: "USDC", name: "USD Coin", balance: "5,115242", value: "5,115 US", icon: "💵", color: "bg-blue-500" },
    { symbol: "WETH", name: "WETH", balance: "0.00104", value: "", icon: "Ξ", color: "bg-gray-700" },
    { symbol: "ETH", name: "ETH", balance: "0.000784", value: "1.98 $US", icon: "Ξ", color: "bg-purple-500" },
    { symbol: "aArbWETH", name: "Aave Arbitrum WETH", balance: "0.00014", value: "", icon: "🔺", color: "bg-pink-500" },
    { symbol: "USDT", name: "USDT", balance: "", value: "", icon: "₮", color: "bg-green-500" },
    { symbol: "DAI", name: "DAI Stablecoin", balance: "", value: "", icon: "◈", color: "bg-yellow-500" },
    { symbol: "WBTC", name: "WBTC", balance: "", value: "", icon: "₿", color: "bg-orange-500" },
];

export function TokenPicker({ onSelect, onClose, selectedToken, embedded = false }: TokenPickerProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredTokens = mockTokens.filter(token =>
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className={cn(
            "w-full bg-background rounded-2xl shadow-xl border",
            embedded ? "h-full flex flex-col" : "max-w-sm mx-auto"
        )}>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onClose}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-base font-medium">Select Token</h2>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search by token name or symbol"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-10 bg-muted/50 border-0"
                        autoFocus
                    />
                </div>
            </div>

            {/* Token List */}
            <div className={cn(
                "overflow-y-auto",
                embedded ? "flex-1" : "max-h-[400px]"
            )}>
                {filteredTokens.map((token) => (
                    <button
                        key={token.symbol}
                        onClick={() => onSelect?.(token)}
                        className={cn(
                            "w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors",
                            selectedToken?.symbol === token.symbol && "bg-muted"
                        )}
                    >
                        {/* Token Icon */}
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
                            token.color || "bg-gray-500"
                        )}>
                            {token.icon}
                        </div>

                        {/* Token Info */}
                        <div className="flex-1 text-left">
                            <div className="flex items-baseline gap-2">
                                <span className="font-medium">{token.symbol}</span>
                                {token.balance && (
                                    <span className="text-sm text-foreground">{token.balance}</span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xs text-muted-foreground">{token.name}</span>
                                {token.value && (
                                    <span className="text-xs text-muted-foreground">{token.value}</span>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
} 