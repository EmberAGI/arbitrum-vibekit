"use client";

import { useState } from "react";
import { TokenPicker } from "@/components/token-picker";
import { Button } from "@/components/ui/button";

export default function TokenPickerDemoPage() {
    const [isOpen, setIsOpen] = useState(true);
    const [selectedToken, setSelectedToken] = useState<any>(null);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Token Picker Demo</h1>
                    <p className="text-muted-foreground">
                        A crypto token browser/picker component matching the provided design.
                    </p>
                </div>

                {selectedToken && (
                    <div className="p-4 bg-background rounded-lg border">
                        <h3 className="font-medium mb-2">Selected Token:</h3>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${selectedToken.color || 'bg-gray-500'}`}>
                                {selectedToken.icon}
                            </div>
                            <div>
                                <div className="font-medium">{selectedToken.symbol}</div>
                                <div className="text-sm text-muted-foreground">{selectedToken.name}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-center">
                    {isOpen ? (
                        <TokenPicker
                            selectedToken={selectedToken}
                            onSelect={(token) => {
                                setSelectedToken(token);
                                setIsOpen(false);
                            }}
                            onClose={() => setIsOpen(false)}
                        />
                    ) : (
                        <Button onClick={() => setIsOpen(true)}>
                            Open Token Picker
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
} 