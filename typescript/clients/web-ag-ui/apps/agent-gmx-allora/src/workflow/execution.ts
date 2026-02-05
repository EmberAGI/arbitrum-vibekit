import type { OnchainActionsClient } from '../clients/onchainActions.js';
import type { ExecutionPlan } from '../core/executionPlan.js';

export type ExecutionResult = {
  action: ExecutionPlan['action'];
  ok: boolean;
  error?: string;
};

export async function executePerpetualPlan(params: {
  client: Pick<
    OnchainActionsClient,
    'createPerpetualLong' | 'createPerpetualShort' | 'createPerpetualClose'
  >;
  plan: ExecutionPlan;
}): Promise<ExecutionResult> {
  const { plan } = params;

  if (plan.action === 'none' || !plan.request) {
    return { action: plan.action, ok: true };
  }

  try {
    if (plan.action === 'long') {
      await params.client.createPerpetualLong(
        plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0],
      );
      return { action: plan.action, ok: true };
    }
    if (plan.action === 'short') {
      await params.client.createPerpetualShort(
        plan.request as Parameters<OnchainActionsClient['createPerpetualShort']>[0],
      );
      return { action: plan.action, ok: true };
    }
    await params.client.createPerpetualClose(
      plan.request as Parameters<OnchainActionsClient['createPerpetualClose']>[0],
    );
    return { action: plan.action, ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { action: plan.action, ok: false, error: message };
  }
}
