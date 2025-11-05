"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bug, Trash2, Download, Search, X } from "lucide-react";

interface DebugLog {
    timestamp: Date;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    data?: any;
}

interface DebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    logs: DebugLog[];
    onClearLogs: () => void;
}

export function DebugModal({ isOpen, onClose, logs, onClearLogs }: DebugModalProps) {
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<'all' | DebugLog['type']>('all');

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

    const getLogBgColor = (type: DebugLog['type']) => {
        switch (type) {
            case 'success': return 'bg-green-900/20';
            case 'warning': return 'bg-yellow-900/20';
            case 'error': return 'bg-red-900/20';
            default: return 'bg-blue-900/20';
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = !searchText ||
            log.message.toLowerCase().includes(searchText.toLowerCase()) ||
            (log.data && JSON.stringify(log.data).toLowerCase().includes(searchText.toLowerCase()));
        const matchesType = filterType === 'all' || log.type === filterType;
        return matchesSearch && matchesType;
    });

    const exportLogs = () => {
        const logsText = filteredLogs.map(log =>
            `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}`
        ).join('\n\n');

        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const logCounts = {
        all: logs.length,
        info: logs.filter(l => l.type === 'info').length,
        success: logs.filter(l => l.type === 'success').length,
        warning: logs.filter(l => l.type === 'warning').length,
        error: logs.filter(l => l.type === 'error').length,
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="!w-[95vw] !max-w-[1800px] sm:!max-w-[1800px] h-[90vh] flex flex-col p-0"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #404040' }}
            >
                <DialogHeader className="px-6 py-4 border-b border-[#404040]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Bug className="w-6 h-6 text-orange-500" />
                            <div>
                                <DialogTitle className="text-xl text-white">Debug Console</DialogTitle>
                                <DialogDescription className="text-gray-400 text-sm mt-1">
                                    Connection logs and debugging information
                                </DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={exportLogs}
                                disabled={filteredLogs.length === 0}
                                style={{ borderColor: '#404040', backgroundColor: 'transparent' }}
                                className="text-gray-400 hover:text-white"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onClearLogs}
                                disabled={logs.length === 0}
                                style={{ borderColor: '#404040', backgroundColor: 'transparent' }}
                                className="text-gray-400 hover:text-white"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Clear
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                className="text-gray-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* Filters and Search */}
                <div className="px-6 py-4 border-b border-[#404040] space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search logs..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="pl-10 h-10 border-[#404040]"
                            style={{ backgroundColor: '#0a0a0a', borderColor: '#404040', color: 'white' }}
                        />
                    </div>

                    {/* Filter badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-400">Filter:</span>
                        <Badge
                            variant={filterType === 'all' ? 'default' : 'outline'}
                            className="cursor-pointer transition-colors"
                            style={filterType === 'all' ? { backgroundColor: '#FD6731', borderColor: '#FD6731' } : { borderColor: '#404040' }}
                            onClick={() => setFilterType('all')}
                        >
                            All ({logCounts.all})
                        </Badge>
                        <Badge
                            variant={filterType === 'info' ? 'default' : 'outline'}
                            className="cursor-pointer transition-colors"
                            style={filterType === 'info' ? { backgroundColor: '#3b82f6', borderColor: '#3b82f6' } : { borderColor: '#404040' }}
                            onClick={() => setFilterType('info')}
                        >
                            ℹ️ Info ({logCounts.info})
                        </Badge>
                        <Badge
                            variant={filterType === 'success' ? 'default' : 'outline'}
                            className="cursor-pointer transition-colors"
                            style={filterType === 'success' ? { backgroundColor: '#22c55e', borderColor: '#22c55e' } : { borderColor: '#404040' }}
                            onClick={() => setFilterType('success')}
                        >
                            ✅ Success ({logCounts.success})
                        </Badge>
                        <Badge
                            variant={filterType === 'warning' ? 'default' : 'outline'}
                            className="cursor-pointer transition-colors"
                            style={filterType === 'warning' ? { backgroundColor: '#eab308', borderColor: '#eab308' } : { borderColor: '#404040' }}
                            onClick={() => setFilterType('warning')}
                        >
                            ⚠️ Warning ({logCounts.warning})
                        </Badge>
                        <Badge
                            variant={filterType === 'error' ? 'default' : 'outline'}
                            className="cursor-pointer transition-colors"
                            style={filterType === 'error' ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : { borderColor: '#404040' }}
                            onClick={() => setFilterType('error')}
                        >
                            ❌ Error ({logCounts.error})
                        </Badge>
                    </div>
                </div>

                {/* Logs content */}
                <div className="flex-1 overflow-y-auto px-6 py-4" style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#404040 transparent'
                }}>
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <Bug className="w-16 h-16 text-gray-600 mb-4" />
                            <div className="text-gray-500 text-lg mb-2">
                                {logs.length === 0 ? 'No debug logs yet' : 'No logs match your filters'}
                            </div>
                            <div className="text-gray-600 text-sm">
                                {logs.length === 0
                                    ? 'Connect to an agent to see connection details and debugging information'
                                    : 'Try adjusting your search or filter criteria'
                                }
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredLogs.map((log, index) => (
                                <div
                                    key={index}
                                    className={`rounded-lg p-4 border transition-all duration-150 hover:shadow-lg ${getLogBgColor(log.type)}`}
                                    style={{ borderColor: '#404040' }}
                                >
                                    <div className="flex items-start gap-3 mb-2">
                                        <span className="text-2xl mt-0.5">{getLogIcon(log.type)}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs text-gray-500 font-mono">
                                                    {log.timestamp.toLocaleTimeString()}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs uppercase"
                                                    style={{ borderColor: '#404040' }}
                                                >
                                                    {log.type}
                                                </Badge>
                                            </div>
                                            <div className={`font-medium text-base ${getLogColor(log.type)}`}>
                                                {log.message}
                                            </div>
                                        </div>
                                    </div>
                                    {log.data && (
                                        <div className="ml-11">
                                            <pre className="text-xs text-gray-300 bg-[#0a0a0a] p-3 rounded border border-[#404040] overflow-x-auto font-mono">
                                                {JSON.stringify(log.data, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

