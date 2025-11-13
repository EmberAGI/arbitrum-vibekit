import { lazy } from 'react';

// Dynamic imports for tool components
const toolComponents = {
  Swaps: lazy(() => import('@/components/tools/Swaps').then((m) => ({ default: m.Swaps }))),
  JsonViewer: lazy(() =>
    import('@/components/tools/JsonViewer').then((m) => ({
      default: m.JsonViewer,
    })),
  ),
  Lending: lazy(() => import('@/components/tools/Lending').then((m) => ({ default: m.Lending }))),
  Liquidity: lazy(() =>
    import('@/components/tools/Liquidity').then((m) => ({
      default: m.Liquidity,
    })),
  ),
  Pendle: lazy(() => import('@/components/tools/Pendle').then((m) => ({ default: m.Pendle }))),
  InteractiveExample: lazy(() =>
    import('@/components/tools/InteractiveExample').then((m) => ({
      default: m.InteractiveExample,
    })),
  ),
  StrategyInputDisplay: lazy(() =>
    import('@/components/tools/StrategyInputDisplay').then((m) => ({
      default: m.StrategyInputDisplay,
    })),
  ),
  WorkflowDispatched: lazy(() =>
    import('@/components/tools/WorkflowDispatched').then((m) => ({
      default: m.WorkflowDispatched,
    })),
  ),
  StrategyDashboard: lazy(() =>
    import('@/components/tools/StrategyDashboard').then((m) => ({
      default: m.StrategyDashboard,
    })),
  ),
  TransactionHistory: lazy(() =>
    import('@/components/tools/TransactionHistory').then((m) => ({
      default: m.TransactionHistory,
    })),
  ),
  StrategySettings: lazy(() =>
    import('@/components/tools/StrategySettings').then((m) => ({
      default: m.StrategySettings,
    })),
  ),
  StrategyPolicies: lazy(() =>
    import('@/components/tools/StrategyPolicies').then((m) => ({
      default: m.StrategyPolicies,
    })),
  ),
  StrategyOverview: lazy(() =>
    import('@/components/tools/StrategyOverview').then((m) => ({
      default: m.StrategyOverview,
    })),
  ),
  WorkflowApprovalHandler: lazy(() =>
    import('@/components/tools/WorkflowApprovalHandler').then((m) => ({
      default: m.WorkflowApprovalHandler,
    })),
  ),
  X402PaymentDisplay: lazy(() =>
    import('@/components/tools/X402PaymentDisplay').then((m) => ({
      default: m.X402PaymentDisplay,
    })),
  ),
};

export type ToolComponentName = keyof typeof toolComponents;

export function getToolComponent(componentName: string) {
  const validComponentName = componentName as ToolComponentName;
  return toolComponents[validComponentName] || toolComponents.JsonViewer;
}

export function isValidToolComponent(componentName: string): componentName is ToolComponentName {
  return componentName in toolComponents;
}
