"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

interface SettingsPanelProps {
    customHeaders: Record<string, string>;
    setCustomHeaders: (headers: Record<string, string>) => void;
    messageMetadata: Record<string, string>;
    setMessageMetadata: (metadata: Record<string, string>) => void;
}

export function SettingsPanel({
    customHeaders,
    setCustomHeaders,
    messageMetadata,
    setMessageMetadata
}: SettingsPanelProps) {
    const [expandedSections, setExpandedSections] = useState({
        headers: false,
        metadata: false,
    });

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const addHeader = () => {
        const newKey = `header-${Date.now()}`;
        setCustomHeaders({
            ...customHeaders,
            [newKey]: ''
        });
    };

    const updateHeader = (key: string, field: 'name' | 'value', value: string) => {
        if (field === 'name') {
            const { [key]: oldValue, ...rest } = customHeaders;
            const newKey = value.trim();
            if (newKey) {
                setCustomHeaders({
                    ...rest,
                    [newKey]: oldValue || ''
                });
            } else {
                setCustomHeaders(rest);
            }
        } else {
            setCustomHeaders({
                ...customHeaders,
                [key]: value
            });
        }
    };

    const removeHeader = (key: string) => {
        const { [key]: _, ...rest } = customHeaders;
        setCustomHeaders(rest);
    };

    const addMetadata = () => {
        const newKey = `metadata-${Date.now()}`;
        setMessageMetadata({
            ...messageMetadata,
            [newKey]: ''
        });
    };

    const updateMetadata = (key: string, field: 'name' | 'value', value: string) => {
        if (field === 'name') {
            const { [key]: oldValue, ...rest } = messageMetadata;
            const newKey = value.trim();
            if (newKey) {
                setMessageMetadata({
                    ...rest,
                    [newKey]: oldValue || ''
                });
            } else {
                setMessageMetadata(rest);
            }
        } else {
            setMessageMetadata({
                ...messageMetadata,
                [key]: value
            });
        }
    };

    const removeMetadata = (key: string) => {
        const { [key]: _, ...rest } = messageMetadata;
        setMessageMetadata(rest);
    };

    return (
        <Card className="mt-4" style={{ backgroundColor: '#2a2a2a', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <CardHeader>
                <CardTitle className="text-white">Settings</CardTitle>
                <CardDescription className="text-gray-400">
                    Configure HTTP headers and message metadata
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* HTTP Headers */}
                <div>
                    <button
                        onClick={() => toggleSection('headers')}
                        className="flex items-center gap-2 text-white font-medium mb-2"
                    >
                        {expandedSections.headers ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        HTTP Headers
                    </button>

                    {expandedSections.headers && (
                        <div className="space-y-2 ml-6">
                            {Object.entries(customHeaders).map(([key, value]) => (
                                <div key={key} className="flex gap-2 items-center">
                                    <Input
                                        placeholder="Header Name"
                                        value={key}
                                        onChange={(e) => updateHeader(key, 'name', e.target.value)}
                                        className="flex-1"
                                        style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
                                    />
                                    <Input
                                        placeholder="Header Value"
                                        value={value}
                                        onChange={(e) => updateHeader(key, 'value', e.target.value)}
                                        className="flex-1"
                                        style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => removeHeader(key)}
                                        className="text-red-400 border-red-400 hover:bg-red-400 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                onClick={addHeader}
                                className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Header
                            </Button>
                        </div>
                    )}
                </div>

                {/* Message Metadata */}
                <div>
                    <button
                        onClick={() => toggleSection('metadata')}
                        className="flex items-center gap-2 text-white font-medium mb-2"
                    >
                        {expandedSections.metadata ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        Message Metadata
                    </button>

                    {expandedSections.metadata && (
                        <div className="space-y-2 ml-6">
                            {Object.entries(messageMetadata).map(([key, value]) => (
                                <div key={key} className="flex gap-2 items-center">
                                    <Input
                                        placeholder="Metadata Key"
                                        value={key}
                                        onChange={(e) => updateMetadata(key, 'name', e.target.value)}
                                        className="flex-1"
                                        style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
                                    />
                                    <Input
                                        placeholder="Metadata Value"
                                        value={value}
                                        onChange={(e) => updateMetadata(key, 'value', e.target.value)}
                                        className="flex-1"
                                        style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => removeMetadata(key)}
                                        className="text-red-400 border-red-400 hover:bg-red-400 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                onClick={addMetadata}
                                className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Metadata
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

