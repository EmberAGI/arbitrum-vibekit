"use client";

import { useState } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export interface Chain {
    id: string;
    name: string;
    icon: string;
    color?: string;
    nativeCurrency?: string;
    blockTime?: string;
    gasPrice?: string;
}

interface ChainPickerProps {
    onSelect?: (chain: Chain) => void;
    onClose?: () => void;
    selectedChain?: Chain;
    embedded?: boolean;
}

// Mock chain data
const mockChains: Chain[] = [
    { id: "arbitrum", name: "Arbitrum One", icon: "A", color: "bg-blue-500", nativeCurrency: "ETH", blockTime: "~0.25s", gasPrice: "0.1 gwei" },
    { id: "ethereum", name: "Ethereum", icon: "Ξ", color: "bg-blue-600", nativeCurrency: "ETH", blockTime: "~12s", gasPrice: "15 gwei" },
    { id: "optimism", name: "Optimism", icon: "O", color: "bg-red-500", nativeCurrency: "ETH", blockTime: "~2s", gasPrice: "0.001 gwei" },
    { id: "base", name: "Base", icon: "B", color: "bg-blue-400", nativeCurrency: "ETH", blockTime: "~2s", gasPrice: "0.05 gwei" },
    { id: "polygon", name: "Polygon", icon: "P", color: "bg-purple-600", nativeCurrency: "MATIC", blockTime: "~2s", gasPrice: "30 gwei" },
    { id: "avalanche", name: "Avalanche", icon: "A", color: "bg-red-600", nativeCurrency: "AVAX", blockTime: "~2s", gasPrice: "25 nAVAX" },
    { id: "bsc", name: "BNB Chain", icon: "B", color: "bg-yellow-500", nativeCurrency: "BNB", blockTime: "~3s", gasPrice: "3 gwei" },
    { id: "gnosis", name: "Gnosis", icon: "G", color: "bg-green-600", nativeCurrency: "xDAI", blockTime: "~5s", gasPrice: "1 gwei" },
    { id: "zksync", name: "zkSync Era", icon: "Z", color: "bg-purple-500", nativeCurrency: "ETH", blockTime: "~1s", gasPrice: "0.25 gwei" },
];

export function ChainPicker({ onSelect, onClose, selectedChain, embedded = false }: ChainPickerProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredChains = mockChains.filter(chain =>
        chain.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chain.id.toLowerCase().includes(searchQuery.toLowerCase())
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
                <h2 className="text-base font-medium">Select Network</h2>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search networks"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-10 bg-muted/50 border-0"
                        autoFocus
                    />
                </div>
            </div>

            {/* Chain List */}
            <div className={cn(
                "overflow-y-auto",
                embedded ? "flex-1" : "max-h-[400px]"
            )}>
                {filteredChains.map((chain) => (
                    <button
                        key={chain.id}
                        onClick={() => onSelect?.(chain)}
                        className={cn(
                            "w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors",
                            selectedChain?.id === chain.id && "bg-muted"
                        )}
                    >
                        {/* Chain Icon */}
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
                            chain.color || "bg-gray-500"
                        )}>
                            {chain.icon}
                        </div>

                        {/* Chain Info */}
                        <div className="flex-1 text-left">
                            <div className="flex items-baseline gap-2">
                                <span className="font-medium">{chain.name}</span>
                                {chain.nativeCurrency && (
                                    <span className="text-sm text-muted-foreground">{chain.nativeCurrency}</span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-2">
                                {chain.blockTime && (
                                    <span className="text-xs text-muted-foreground">{chain.blockTime}</span>
                                )}
                                {chain.gasPrice && (
                                    <span className="text-xs text-muted-foreground">• {chain.gasPrice}</span>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
} 