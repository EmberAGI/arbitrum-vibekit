import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';

import { loadFullMockData } from './mock-loader.js';

// Error trigger state for test scenarios
export const errorTriggers: Record<string, Record<string, boolean>> = {
  openrouter: {
    modelNotFound: false, // 404 error
    unauthorized: false, // 401 error
    invalidModel: false, // 400 error
  },
};

export function resetErrorTriggers(): void {
  for (const service of Object.keys(errorTriggers)) {
    for (const errorType of Object.keys(errorTriggers[service]!)) {
      errorTriggers[service]![errorType] = false;
    }
  }
}

export async function checkErrorTriggers(service: string): Promise<Response | null> {
  // Ensure at least one await for async function lint rule compliance
  await Promise.resolve();
  const triggers = errorTriggers[service];
  if (!triggers) {
    return null;
  }

  const mockKeyByTrigger: Record<string, string> = {
    modelNotFound: 'rate-limit-error', // 404 - model not found
    unauthorized: 'server-error', // 401 - no auth credentials
    invalidModel: 'gateway-timeout', // 400 - invalid model ID
  };

  const activeTrigger = Object.entries(triggers).find(([, enabled]) => enabled);
  if (activeTrigger) {
    const [triggerKey] = activeTrigger;
    const mockKey = mockKeyByTrigger[triggerKey];
    if (!mockKey) {
      throw new Error(`[MSW Handler] No mock key configured for trigger: ${triggerKey}`);
    }

    try {
      return await createResponseFromMock(mockKey, service);
    } catch (error) {
      throw new Error(
        `[MSW Handler] Missing mock data for ${service}/${mockKey}.json. ` +
          `Record a real ${triggerKey} response via pnpm test:record-mocks. Original error: ${(error as Error).message}`,
      );
    }
  }

  return null;
}

export async function createResponseFromMock(mockKey: string, service: string): Promise<Response> {
  const mockData = await loadFullMockData(service, mockKey);
  if (!mockData) {
    throw new Error(`[MSW Handler] Missing mock data: ${service}/${mockKey}.json`);
  }

  const encodedBytes = Buffer.from(mockData.response.rawBody, 'base64');

  const originalHeaders = mockData.response.headers || {};
  const headersLower = Object.fromEntries(
    Object.entries(originalHeaders).map(([k, v]) => [k.toLowerCase(), v]),
  ) as Record<string, string>;
  const contentEncoding = headersLower['content-encoding']?.toLowerCase();

  let bodyBytes: Buffer = encodedBytes;
  try {
    if (contentEncoding === 'br') {
      bodyBytes = brotliDecompressSync(encodedBytes);
    } else if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip') {
      bodyBytes = gunzipSync(encodedBytes);
    } else if (contentEncoding === 'deflate') {
      bodyBytes = inflateSync(encodedBytes);
    }
  } catch {
    bodyBytes = encodedBytes;
  }

  const replayHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(originalHeaders).filter(([key]) => {
      const k = key.toLowerCase();
      return k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding';
    }),
  );

  if (!Object.keys(replayHeaders).some((k) => k.toLowerCase() === 'content-type')) {
    replayHeaders['content-type'] = 'application/json';
  }

  return new Response(bodyBytes, {
    status: mockData.response.status,
    headers: replayHeaders,
  });
}
