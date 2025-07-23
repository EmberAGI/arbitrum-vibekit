// Re-export all agent components
export { Swaps } from './Swaps';
export { Lending } from './Lending';
export { Liquidity } from './Liquidity';
export { Pendle } from './Pendle';
export { TemplateComponent } from './TemplateComponent';

// Export types
export type {
  BaseAgentComponentProps,
  LiquidityComponentProps,
  PendleComponentProps,
  TemplateComponentProps,
  AgentComponentProps,
  ComponentRegistry,
  ComponentRegistryEntry,
} from './types'; 