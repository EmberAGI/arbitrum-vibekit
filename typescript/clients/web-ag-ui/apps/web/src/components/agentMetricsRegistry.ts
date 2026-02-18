export type MetricsRendererId = 'default' | 'agent-gmx-allora' | 'agent-pendle';

const AGENT_METRICS_RENDERERS: Record<string, MetricsRendererId> = {
  'agent-gmx-allora': 'agent-gmx-allora',
  'agent-pendle': 'agent-pendle',
};

export function resolveMetricsRendererId(agentId: string): MetricsRendererId {
  return AGENT_METRICS_RENDERERS[agentId] ?? 'default';
}
