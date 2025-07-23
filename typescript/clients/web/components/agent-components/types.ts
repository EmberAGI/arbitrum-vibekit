import type { TxPlan } from '../../lib/transactionUtils';

// Base props that all agent components should accept
export interface BaseAgentComponentProps {
  txPreview: any;
  txPlan: TxPlan | null;
}

// Extended props for specific components
export interface LiquidityComponentProps extends BaseAgentComponentProps {
  positions?: any;
  pools?: any;
}

export interface PendleComponentProps extends BaseAgentComponentProps {
  markets?: any[];
  isMarketList?: boolean;
}

export interface TemplateComponentProps extends BaseAgentComponentProps {
  jsonObject?: any;
}

// Union type for all possible props
export type AgentComponentProps = 
  | BaseAgentComponentProps 
  | LiquidityComponentProps 
  | PendleComponentProps 
  | TemplateComponentProps;

// Component registry type
export interface ComponentRegistryEntry {
  toolNamePattern: string | RegExp;
  componentPath: string;
  propsExtractor?: (toolInvocationResult: any) => Record<string, any>;
}

export type ComponentRegistry = ComponentRegistryEntry[]; 