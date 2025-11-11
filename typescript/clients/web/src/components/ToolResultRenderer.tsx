'use client';

import { Suspense, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/tools/JsonViewer";
import { getToolConfig, getCategoryConfig } from "@/config/tools";
import { getToolComponent } from "@/lib/toolComponentLoader";
import { getTransformer } from "@/lib/dataTransformers";
import { Eye, Code, Loader2 } from "lucide-react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback: React.ReactNode;
}

function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
    try {
        return <>{children}</>;
    } catch (error) {
        console.error('Component error:', error);
        return <>{fallback}</>;
    }
}

export interface ToolResultRendererProps {
    toolName: string;
    result: any;
    isLoading?: boolean;
    error?: string | null;
    onUserAction?: (data: any) => Promise<void>; // Callback for bidirectional communication
    onNavigate?: (sessionId: string) => void; // Callback for navigation to child sessions
    workflowChildSessions?: Record<string, string>; // Maps childTaskId to childSessionId
    sessions?: Record<string, any>; // All sessions
    sessionOrder?: string[]; // Session order
}

export function ToolResultRenderer({
    toolName,
    result,
    isLoading = false,
    error = null,
    onUserAction,
    onNavigate,
    workflowChildSessions = {},
    sessions = {},
    sessionOrder = []
}: ToolResultRendererProps) {
    const [viewMode, setViewMode] = useState<'component' | 'json'>('component');

    const toolConfig = getToolConfig(toolName);
    const categoryConfig = toolConfig ? getCategoryConfig(toolConfig.category) : null;

    // Check if result is empty (loading state from artifact)
    const resultIsEmpty = !result || (typeof result === 'object' && Object.keys(result).length === 0);
    const showLoading = isLoading || resultIsEmpty;

    // Get the appropriate component
    const componentName = toolConfig?.component || 'JsonViewer';
    const ToolComponent = getToolComponent(componentName);

    // Transform data for specific tools
    let componentProps = result;
    if (componentName !== 'JsonViewer' && !resultIsEmpty) {
        const transformer = getTransformer(toolName);
        componentProps = transformer(result);
    }

    // Add onUserAction callback to component props if available
    if (onUserAction && componentName !== 'JsonViewer') {
        componentProps = {
            ...componentProps,
            onUserAction,
        };
    }

    // Add onNavigate callback for workflow dispatch components
    if (onNavigate && componentName !== 'JsonViewer') {
        componentProps = {
            ...componentProps,
            onNavigate,
            workflowChildSessions,
            sessions,
            sessionOrder,
        };
    }

    if (showLoading) {
        return (
            <Card className="component-fade-in">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {resultIsEmpty ? 'Preparing' : 'Executing'} {toolConfig?.name || toolName}...
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <div className="text-muted-foreground">
                            {resultIsEmpty ? 'Preparing transaction...' : 'Processing your request...'}
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="border-red-200 dark:border-red-800 component-fade-in">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <span className="text-red-500">❌</span>
                        Error: {toolConfig?.name || toolName}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                            {error}
                        </pre>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!result) {
        return (
            <Card className="component-fade-in">
                <CardHeader>
                    <CardTitle>No Result</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground">No data returned from tool.</div>
                </CardContent>
            </Card>
        );
    }

    // For interactive components (like WorkflowDispatched), render directly without Card wrapper
    const isInteractiveComponent = toolConfig?.category === 'interactive' && componentName !== 'JsonViewer';

    if (isInteractiveComponent && viewMode === 'component') {
        return (
            <Suspense
                fallback={
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-muted-foreground">Loading component...</span>
                    </div>
                }
            >
                <ErrorBoundary
                    fallback={
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 mb-2">
                                <span>⚠️</span>
                                <span className="font-medium">Component Error</span>
                            </div>
                            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                                The custom component failed to render. Showing JSON view instead.
                            </p>
                            <JsonViewer
                                data={result}
                                title={`${toolConfig?.name || toolName} Result (Fallback)`}
                            />
                        </div>
                    }
                >
                    <ToolComponent {...componentProps} />
                </ErrorBoundary>
            </Suspense>
        );
    }

    return (
        <Card className="w-full component-fade-in">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                            <span>📋</span>
                            {toolConfig?.name || toolName}
                            {categoryConfig && (
                                <Badge variant="secondary" className="ml-2">
                                    {categoryConfig.name}
                                </Badge>
                            )}
                        </CardTitle>
                        {toolConfig?.description && (
                            <CardDescription className="mt-1">
                                {toolConfig.description}
                            </CardDescription>
                        )}
                    </div>

                    {/* Only show view mode toggle if there's a custom component */}
                    {componentName !== 'JsonViewer' && (
                        <div className="flex gap-1 ml-4">
                            <Button
                                variant={viewMode === 'component' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('component')}
                                className="h-8"
                            >
                                <Eye className="w-3 h-3 mr-1" />
                                UI
                            </Button>
                            <Button
                                variant={viewMode === 'json' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('json')}
                                className="h-8"
                            >
                                <Code className="w-3 h-3 mr-1" />
                                JSON
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent>
                {viewMode === 'json' || componentName === 'JsonViewer' ? (
                    <JsonViewer
                        data={result}
                        title={`${toolConfig?.name || toolName} Result`}
                    />
                ) : (
                    <Suspense
                        fallback={
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                <span className="text-muted-foreground">Loading component...</span>
                            </div>
                        }
                    >
                        <ErrorBoundary
                            fallback={
                                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                    <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 mb-2">
                                        <span>⚠️</span>
                                        <span className="font-medium">Component Error</span>
                                    </div>
                                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                                        The custom component failed to render. Showing JSON view instead.
                                    </p>
                                    <JsonViewer
                                        data={result}
                                        title={`${toolConfig?.name || toolName} Result (Fallback)`}
                                    />
                                </div>
                            }
                        >
                            <ToolComponent
                                {...(componentName === 'JsonViewer' ? { data: result } : componentProps)}
                            />
                        </ErrorBoundary>
                    </Suspense>
                )}
            </CardContent>
        </Card>
    );
}
