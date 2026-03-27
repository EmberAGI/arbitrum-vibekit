import {
  createPiRuntimeGatewayAgUiHandler,
  type PiRuntimeGatewayService,
} from 'agent-runtime';

import {
  loadEmberLendingRuntimeModule,
  type EmberLendingRuntimeEnv,
  type EmberLendingRuntimeModule,
} from './privateRuntime.js';

export const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';
export const EMBER_LENDING_AG_UI_BASE_PATH = '/ag-ui';

type EmberLendingAgUiHandlerOptions = {
  agentId?: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

type CreateEmberLendingGatewayServiceOptions = {
  env?: EmberLendingRuntimeEnv;
  loadRuntimeModule?: (env: EmberLendingRuntimeEnv) => Promise<EmberLendingRuntimeModule>;
};

export async function createEmberLendingGatewayService(
  options: CreateEmberLendingGatewayServiceOptions = {},
): Promise<PiRuntimeGatewayService> {
  const env = options.env ?? process.env;
  const runtimeModule = await (options.loadRuntimeModule ?? loadEmberLendingRuntimeModule)(env);

  return await runtimeModule.createEmberLendingGatewayService({ env });
}

export function createEmberLendingAgUiHandler(options: EmberLendingAgUiHandlerOptions) {
  return createPiRuntimeGatewayAgUiHandler({
    agentId: options.agentId ?? EMBER_LENDING_AGENT_ID,
    service: options.service,
    basePath: options.basePath ?? EMBER_LENDING_AG_UI_BASE_PATH,
  });
}
