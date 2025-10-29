import { Para, Environment } from "@getpara/server-sdk";

/**
 * Initialize and return a Para server client instance
 *
 * Configuration should be set via environment variables:
 * - PARA_API_KEY: Your Para API key
 * - PARA_ENVIRONMENT: 'PROD' or 'BETA' (defaults to BETA)
 *
 * For more configuration options, see: https://docs.getpara.com/v2/server/setup
 */
export function getParaServerClient() {
  const apiKey = process.env.PARA_API_KEY;
  const environment =
    process.env.PARA_ENVIRONMENT === "PROD"
      ? Environment.PROD
      : Environment.BETA;

  if (!apiKey) {
    throw new Error("PARA_API_KEY environment variable is required");
  }

  return new Para(environment, apiKey);
}
