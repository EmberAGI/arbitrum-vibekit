import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { interrupt, type Command } from '@langchain/langgraph';
import { z } from 'zod';

import { GmxSetupInputSchema } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type GmxSetupInterrupt,
  type ClmmUpdate,
} from '../context.js';

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
};

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const collectSetupInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectSetupInput: entering node');

  const request: GmxSetupInterrupt = {
    type: 'gmx-setup-request',
    message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
    payloadSchema: z.toJSONSchema(GmxSetupInputSchema),
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting market + allocation to continue onboarding.',
  );

  await copilotkitEmitState(config, {
    view: {
      onboarding: { ...ONBOARDING, step: 1 },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: [] },
    },
  });

  const incoming: unknown = await interrupt(request);

  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
    } catch {
      // ignore
    }
  }

  const parsed = GmxSetupInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid setup input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: [] },
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  const normalized =
    'usdcAllocation' in parsed.data
      ? parsed.data
      : {
          walletAddress: parsed.data.walletAddress,
          usdcAllocation: parsed.data.baseContributionUsd,
          targetMarket: parsed.data.targetMarket,
        };

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Market and USDC allocation received. Preparing funding token options.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  return {
    view: {
      operatorInput: normalized,
      onboarding: { ...ONBOARDING, step: 2 },
      task,
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
