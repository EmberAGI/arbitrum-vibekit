'use client';

import { useCallback } from 'react';
import { useArtifact } from '@/hooks/use-artifact';
import type {
    AgentSidepanelRegistry,
    AgentSidepanelConfig,
    SidepanelTriggerMode,
    BaseAgentSidepanelProps,
} from '../artifacts/agent-sidepanels/types';
import { agentSidepanelRegistry } from '../agents-config';

// Debug: Log the registry at module load time
console.log('📚 Agent sidepanel registry loaded:', agentSidepanelRegistry);

// Map of available sidepanels
const sidepanelArtifacts = {
    'hello-world': () => import('../artifacts/agent-sidepanels/hello-world-artifact').then(m => m.helloWorldArtifact),
    // Add more sidepanels here as they're created
};

console.log('🗺️ Sidepanel artifacts map:', Object.keys(sidepanelArtifacts));

/**
 * Finds the appropriate sidepanel configuration for given criteria
 */
export function findSidepanelConfig(
    agentId: string,
    triggerMode: SidepanelTriggerMode,
    data?: {
        toolName?: string;
        toolInvocationResult?: any;
        txPreview?: any;
        txPlan?: any;
    }
): AgentSidepanelConfig | null {
    console.log('🔍 Finding sidepanel config:', { agentId, triggerMode, registryLength: agentSidepanelRegistry.length });

    const configs = agentSidepanelRegistry.filter(config => {
        console.log('🔄 Checking config:', {
            configAgentId: config.agentId,
            configTriggerMode: config.triggerMode,
            sidepanelId: config.sidepanelId
        });

        // Must match agent
        if (config.agentId !== agentId && config.agentId !== 'all') {
            console.log('❌ Agent ID mismatch');
            return false;
        }

        // Must match trigger mode
        if (config.triggerMode !== triggerMode) {
            console.log('❌ Trigger mode mismatch');
            return false;
        }

        // Additional checks based on trigger mode
        if (triggerMode === 'on-tool-invocation' && data?.toolName) {
            if (config.toolNamePattern) {
                if (typeof config.toolNamePattern === 'string') {
                    return data.toolName.endsWith(config.toolNamePattern);
                }
                return config.toolNamePattern.test(data.toolName);
            }
        }

        if (triggerMode === 'on-property-existence' && config.triggerProperty) {
            // Check if the property exists in any of the data
            const allData = { ...data?.toolInvocationResult, ...data };
            return hasNestedProperty(allData, config.triggerProperty);
        }

        console.log('✅ Config matches!');
        return true;
    });

    // Sort by priority (higher priority first)
    configs.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    console.log('📋 Matching configs:', configs);
    const selectedConfig = configs[0] || null;
    console.log('🎯 Selected config:', selectedConfig);

    return selectedConfig;
}

/**
 * Helper function to check if a nested property exists
 */
function hasNestedProperty(obj: any, propertyPath: string): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const keys = propertyPath.split('.');
    let current = obj;

    for (const key of keys) {
        if (current == null || typeof current !== 'object' || !(key in current)) {
            return false;
        }
        current = current[key];
    }

    return current != null;
}

/**
 * Extracts props for a sidepanel based on its configuration
 */
export function extractSidepanelProps(
    config: AgentSidepanelConfig,
    data: {
        toolInvocationResult?: any;
        selectedAgentId?: string;
        txPreview?: any;
        txPlan?: any;
        isReadonly?: boolean;
    }
): BaseAgentSidepanelProps {
    const baseProps: BaseAgentSidepanelProps = {
        txPreview: data.txPreview,
        txPlan: data.txPlan,
        toolInvocationResult: data.toolInvocationResult,
        selectedAgentId: data.selectedAgentId,
        isReadonly: data.isReadonly,
    };

    if (config.propsExtractor) {
        const extractedProps = config.propsExtractor(data);
        console.log('📦 Extracted props:', extractedProps);
        return { ...baseProps, ...extractedProps };
    }

    console.log('📦 Using base props only:', baseProps);
    return baseProps;
}

/**
 * Custom hook to manage dynamic sidepanel triggers
 */
export function useDynamicSidepanel() {
    const { setArtifact } = useArtifact();

    const triggerSidepanel = useCallback(async (
        agentId: string,
        triggerMode: SidepanelTriggerMode,
        data?: {
            toolName?: string;
            toolInvocationResult?: any;
            txPreview?: any;
            txPlan?: any;
            isReadonly?: boolean;
        }
    ) => {
        console.log('🚀 Triggering sidepanel:', { agentId, triggerMode, data });

        const config = findSidepanelConfig(agentId, triggerMode, data);

        if (!config) {
            console.log('❌ No matching sidepanel config found');
            return false; // No matching sidepanel found
        }

        console.log('✅ Found config, loading artifact:', config.sidepanelId);

        // Get the artifact loader
        const artifactLoader = sidepanelArtifacts[config.sidepanelId as keyof typeof sidepanelArtifacts];

        if (!artifactLoader) {
            console.warn(`❌ Sidepanel artifact ${config.sidepanelId} not found in sidepanelArtifacts map`);
            return false;
        }

        try {
            console.log('🔄 Loading artifact...');
            // Load the artifact
            const artifact = await artifactLoader();
            console.log('✅ Artifact loaded:', artifact);

            // Extract props
            const props = extractSidepanelProps(config, {
                toolInvocationResult: data?.toolInvocationResult,
                selectedAgentId: agentId,
                txPreview: data?.txPreview,
                txPlan: data?.txPlan,
                isReadonly: data?.isReadonly,
            });

            // Use a stable identifier instead of Date.now() to prevent constant re-renders
            const documentId = `${config.sidepanelId}-${agentId}`;

            const artifactData = {
                documentId,
                content: JSON.stringify(props),
                kind: artifact.kind,
                title: `${agentId} Panel`,
                status: 'idle' as const,
                isVisible: true,
                sidepanelMode: 'default' as const, // Set default sidepanel mode
                boundingBox: {
                    top: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                },
            };

            console.log('🎨 Setting artifact state:', artifactData);

            // Set artifact state to show the sidepanel
            setArtifact(artifactData);

            console.log('✅ Sidepanel should now be visible!');
            return true;
        } catch (error) {
            console.error('❌ Failed to load sidepanel:', error);
            return false;
        }
    }, [setArtifact]);

    const hideSidepanel = useCallback(() => {
        console.log('🙈 Hiding sidepanel');
        setArtifact((current) => ({
            ...current,
            isVisible: false,
        }));
    }, [setArtifact]);

    return {
        triggerSidepanel,
        hideSidepanel,
    };
} 