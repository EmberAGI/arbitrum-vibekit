import { promises as fs } from 'fs';
import path from 'path';

import { z } from 'zod';

export const mockMetadataSchema = z.object({
  service: z.string(),
  endpoint: z.string(),
  method: z.string(),
  recordedAt: z.string(),
  apiVersion: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const mockDataSchema = z.object({
  metadata: mockMetadataSchema,
  request: z.object({
    headers: z.record(z.string()).optional(),
    params: z.record(z.unknown()).optional(),
    body: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number(),
    headers: z.record(z.string()).optional(),
    rawBody: z.string(),
  }),
});

export type MockData = z.infer<typeof mockDataSchema>;

export async function saveMockData(service: string, key: string, data: MockData): Promise<void> {
  const mockDir = path.join(process.cwd(), 'tests/mocks/data', service);
  const mockPath = path.join(mockDir, `${key}.json`);

  await fs.mkdir(mockDir, { recursive: true });
  await fs.writeFile(mockPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function recordMockData(
  service: string,
  endpoint: string,
  method: string,
  request: {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    body?: unknown;
  },
  response: {
    status: number;
    headers?: Record<string, string>;
    rawBody: string;
  },
  key: string,
  apiVersion?: string,
): Promise<void> {
  const mockData: MockData = {
    metadata: {
      service,
      endpoint,
      method,
      recordedAt: new Date().toISOString(),
      apiVersion,
    },
    request,
    response,
  };

  await saveMockData(service, key, mockData);
}

export async function loadFullMockData(service: string, key: string): Promise<MockData | null> {
  try {
    const mockPath = path.join(process.cwd(), 'tests/mocks/data', service, `${key}.json`);
    const fileContent = await fs.readFile(mockPath, 'utf-8');
    const parsedJson = JSON.parse(fileContent);

    // Tape recorder: no validation at runtime.
    const mockData = parsedJson as MockData;

    if (mockData.metadata?.expiresAt) {
      const expiryDate = new Date(mockData.metadata.expiresAt);
      if (expiryDate < new Date()) {
        console.warn(`Mock data expired: ${service}/${key}`);
        return null;
      }
    }

    return mockData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
