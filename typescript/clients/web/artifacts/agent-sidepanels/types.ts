import type { ComponentType } from 'react';
import type { Artifact } from '@/components/create-artifact';

// Base props that all agent sidepanels receive
export interface BaseAgentSidepanelProps {
  txPreview?: any;
  txPlan?: any;
  toolInvocationResult?: any;
  selectedAgentId?: string;
  isReadonly?: boolean;
}

// Extended props for specific sidepanels
export interface LendingSidepanelProps extends BaseAgentSidepanelProps {
  lendingData?: any;
}

export interface SwapSidepanelProps extends BaseAgentSidepanelProps {
  swapData?: any;
}

// Trigger modes for sidepanels
export type SidepanelTriggerMode = 
  | 'on-agent-selection'     // Show when agent is selected
  | 'on-tool-invocation'     // Show on any tool invocation response
  | 'on-property-existence'  // Show when specific property exists in response

// Sidepanel configuration
export interface AgentSidepanelConfig {
  sidepanelId: string;
  agentId: string;
  triggerMode: SidepanelTriggerMode;
  
  // For property-based triggers
  triggerProperty?: string;
  
  // For tool-based triggers  
  toolNamePattern?: string | RegExp;
  
  // Props extraction function
  propsExtractor?: (data: {
    toolInvocationResult?: any;
    selectedAgentId?: string;
    txPreview?: any;
    txPlan?: any;
  }) => Record<string, any>;
  
  // Priority for multiple matching configs
  priority?: number;
}

// Registry type
export type AgentSidepanelRegistry = AgentSidepanelConfig[];

// Map of available sidepanels
export interface SidepanelDefinition {
  id: string;
  artifact: Artifact<any, any>;
  displayName: string;
  description: string;
} 