'use client';

import { lazy, Suspense } from 'react';
import type { ComponentRegistry, AgentComponentProps } from '../components/agent-components/types';
import { componentRegistry } from '../agents-config';

// Import agent components dynamically
const componentMap = {
    Swaps: lazy(() => import('../components/agent-components/Swaps').then(m => ({ default: m.Swaps }))),
    Lending: lazy(() => import('../components/agent-components/Lending').then(m => ({ default: m.Lending }))),
    Liquidity: lazy(() => import('../components/agent-components/Liquidity').then(m => ({ default: m.Liquidity }))),
    Pendle: lazy(() => import('../components/agent-components/Pendle').then(m => ({ default: m.Pendle }))),
    TemplateComponent: lazy(() => import('../components/agent-components/TemplateComponent').then(m => ({ default: m.TemplateComponent }))),

    // Legacy components (non-agent components) - these don't follow AgentComponentProps
    Weather: lazy(() => import('../components/weather').then(m => ({ default: m.Weather }))),
    DocumentPreview: lazy(() => import('../components/document-preview').then(m => ({ default: m.DocumentPreview }))),
    DocumentToolCall: lazy(() => import('../components/document').then(m => ({ default: m.DocumentToolCall }))),
    DocumentToolResult: lazy(() => import('../components/document').then(m => ({ default: m.DocumentToolResult }))),
};

type ComponentMapKeys = keyof typeof componentMap;

/**
 * Finds the appropriate component configuration for a given tool name
 */
export function findComponentConfig(toolName: string) {
    for (const config of componentRegistry) {
        if (typeof config.toolNamePattern === 'string') {
            if (toolName.includes(config.toolNamePattern)) {
                return config;
            }
        } else if (config.toolNamePattern instanceof RegExp) {
            if (config.toolNamePattern.test(toolName)) {
                return config;
            }
        }
    }
    return null;
}

/**
 * Extracts props for a component using its configuration
 */
export function extractComponentProps(
    toolInvocationResult: any,
    config: ComponentRegistry[number],
    baseProps: { txPreview: any; txPlan: any }
): AgentComponentProps {
    if (config.propsExtractor) {
        const extractedProps = config.propsExtractor(toolInvocationResult);
        return { ...baseProps, ...extractedProps };
    }
    return baseProps;
}

/**
 * Loading component shown while dynamic components are being loaded
 */
function ComponentLoader() {
    return (
        <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full size-6 border-b-2 border-gray-900"></div>
        </div>
    );
}

export interface DynamicComponentRendererProps {
    toolName: string;
    toolInvocationResult?: any;
    txPreview: any;
    txPlan: any;
    isReadonly: boolean;
    args?: any;
    result?: any;
}

/**
 * Dynamically renders components based on tool name and configuration
 */
export function DynamicComponentRenderer({
    toolName,
    toolInvocationResult,
    txPreview,
    txPlan,
    isReadonly,
    args,
    result
}: DynamicComponentRendererProps) {
    const config = findComponentConfig(toolName);

    if (!config) {
        console.log(`No component config found for tool: ${toolName}, using TemplateComponent`);
        const TemplateComponent = componentMap.TemplateComponent;
        return (
            <Suspense fallback={<ComponentLoader />}>
                <TemplateComponent
                    txPreview={txPreview}
                    txPlan={txPlan}
                    jsonObject={toolInvocationResult}
                />
            </Suspense>
        );
    }

    const componentPath = config.componentPath as ComponentMapKeys;
    const Component = componentMap[componentPath];

    if (!Component) {
        console.warn(`Component ${componentPath} not found in component map`);
        const TemplateComponent = componentMap.TemplateComponent;
        return (
            <Suspense fallback={<ComponentLoader />}>
                <TemplateComponent
                    txPreview={txPreview}
                    txPlan={txPlan}
                    jsonObject={toolInvocationResult}
                />
            </Suspense>
        );
    }

    const props = extractComponentProps(toolInvocationResult, config, { txPreview, txPlan });

    // Handle special legacy components that need different props
    if (componentPath === 'Weather') {
        const WeatherComponent = Component as any; // Type assertion for legacy component
        return (
            <Suspense fallback={<ComponentLoader />}>
                <WeatherComponent weatherAtLocation={result} />
            </Suspense>
        );
    }

    if (componentPath === 'DocumentPreview') {
        const DocumentPreviewComponent = Component as any; // Type assertion for legacy component
        return (
            <Suspense fallback={<ComponentLoader />}>
                <DocumentPreviewComponent isReadonly={isReadonly} args={args} result={result} />
            </Suspense>
        );
    }

    if (componentPath === 'DocumentToolCall') {
        const DocumentToolCallComponent = Component as any; // Type assertion for legacy component
        return (
            <Suspense fallback={<ComponentLoader />}>
                <DocumentToolCallComponent type="update" args={args} isReadonly={isReadonly} />
            </Suspense>
        );
    }

    if (componentPath === 'DocumentToolResult') {
        const DocumentToolResultComponent = Component as any; // Type assertion for legacy component
        return (
            <Suspense fallback={<ComponentLoader />}>
                <DocumentToolResultComponent type="update" result={result} isReadonly={isReadonly} />
            </Suspense>
        );
    }

    // For agent components that follow the AgentComponentProps interface
    const AgentComponent = Component as any; // Type assertion for agent components
    return (
        <Suspense fallback={<ComponentLoader />}>
            <AgentComponent {...props} />
        </Suspense>
    );
} 