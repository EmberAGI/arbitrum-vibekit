"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Bug, Trash2 } from "lucide-react";

interface DebugLog {
    timestamp: Date;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    data?: any;
}

interface DebugPanelProps {
    logs: DebugLog[];
    onClearLogs: () => void;
}

export function DebugPanel({ logs, onClearLogs }: DebugPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const getLogIcon = (type: DebugLog['type']) => {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            default: return 'ℹ️';
        }
    };

    const getLogColor = (type: DebugLog['type']) => {
        switch (type) {
            case 'success': return 'text-green-400';
            case 'warning': return 'text-yellow-400';
            case 'error': return 'text-red-400';
            default: return 'text-blue-400';
        }
    };

    return (
        <Card className="mt-4" style={{ backgroundColor: '#2a2a2a', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bug className="w-5 h-5 text-gray-400" />
                        <CardTitle className="text-white">Debug Console</CardTitle>
                        <Badge variant="outline" className="text-xs">
                            {logs.length} logs
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onClearLogs}
                            className="text-gray-400 border-gray-600 hover:bg-gray-700"
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-gray-400 border-gray-600 hover:bg-gray-700"
                        >
                            {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </div>
                <CardDescription className="text-gray-400">
                    Connection logs and debugging information
                </CardDescription>
            </CardHeader>

            {isExpanded && (
                <CardContent>
                    <div
                        className="space-y-2 max-h-64 overflow-y-auto"
                        style={{
                            backgroundColor: '#1a1a1a',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                        }}
                    >
                        {logs.length === 0 ? (
                            <div className="text-gray-500 text-center py-4">
                                No debug logs yet. Connect to an agent to see connection details.
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} className="border-b border-gray-700 pb-2 last:border-b-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-gray-500 text-xs">
                                            {log.timestamp.toLocaleTimeString()}
                                        </span>
                                        <span className="text-lg">{getLogIcon(log.type)}</span>
                                        <span className={`font-medium ${getLogColor(log.type)}`}>
                                            {log.message}
                                        </span>
                                    </div>
                                    {log.data && (
                                        <pre className="text-xs text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto">
                                            {JSON.stringify(log.data, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

