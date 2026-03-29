import { createPiExampleGatewayService } from './agUiServer.js';
import type { PiExampleGatewayEnv } from './piExampleFoundation.js';

type PiExampleServerEnv = PiExampleGatewayEnv & {
  PORT?: string;
};

type PiExampleGatewayService = Awaited<ReturnType<typeof createPiExampleGatewayService>>;

type PreparePiExampleServerOptions = {
  env?: PiExampleServerEnv;
  createService?: (options: { env: PiExampleServerEnv }) => Promise<PiExampleGatewayService>;
};

function normalizeDatabaseUrl(databaseUrl: string | undefined): string | null {
  const normalized = databaseUrl?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export async function preparePiExampleServer(
  options: PreparePiExampleServerOptions = {},
): Promise<{
  databaseUrl: string | null;
  port: number;
  service: PiExampleGatewayService;
}> {
  const env = options.env ?? process.env;
  const service = await (options.createService ?? createPiExampleGatewayService)({
    env,
  });

  return {
    databaseUrl: normalizeDatabaseUrl(env.DATABASE_URL),
    port: Number.parseInt(env.PORT ?? '3410', 10),
    service,
  };
}
