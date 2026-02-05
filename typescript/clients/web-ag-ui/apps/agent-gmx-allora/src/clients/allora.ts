import { z } from 'zod';

type RawInference = {
  network_inferences: {
    topic_id: string | number;
    combined_value: string;
  };
  confidence_interval_values: string[];
};

const RawInferenceSchema = z.object({
  network_inferences: z.object({
    topic_id: z.union([z.string(), z.number()]),
    combined_value: z.string(),
  }),
  confidence_interval_values: z.array(z.string()),
});

type ConsumerInferencePayload = {
  request_id?: string;
  status?: boolean;
  data?: {
    inference_data?: {
      network_inference_normalized?: string;
      network_inference?: string;
      topic_id?: string | number;
    };
  };
};

const ConsumerInferenceSchema = z.object({
  request_id: z.string().optional(),
  status: z.boolean().optional(),
  data: z
    .object({
      inference_data: z
        .object({
          network_inference_normalized: z.string().optional(),
          network_inference: z.string().optional(),
          topic_id: z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type AlloraInference = {
  topicId: number;
  combinedValue: number;
  confidenceIntervalValues: number[];
};

function parseFiniteNumber(value: string | number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

export function parseAlloraInferenceResponse(payload: unknown): AlloraInference {
  const rawParse = RawInferenceSchema.safeParse(payload);
  if (rawParse.success) {
    const parsed: RawInference = rawParse.data;
    const topicId = parseFiniteNumber(parsed.network_inferences.topic_id, 'topic_id');
    const combinedValue = parseFiniteNumber(
      parsed.network_inferences.combined_value,
      'combined_value',
    );
    const confidenceIntervalValues = parsed.confidence_interval_values.map((value) =>
      parseFiniteNumber(value, 'confidence_interval_values'),
    );

    return {
      topicId,
      combinedValue,
      confidenceIntervalValues,
    };
  }

  const consumerParsed: ConsumerInferencePayload = ConsumerInferenceSchema.parse(payload);
  const inference = consumerParsed.data?.inference_data;
  if (!inference?.network_inference_normalized && !inference?.network_inference) {
    throw new Error('Allora inference payload missing network_inference');
  }

  const combinedValue = parseFiniteNumber(
    inference.network_inference_normalized ?? inference.network_inference ?? '',
    'combined_value',
  );
  const topicId = parseFiniteNumber(inference.topic_id ?? '', 'topic_id');
  return {
    topicId,
    combinedValue,
    confidenceIntervalValues: [combinedValue],
  };
}

export async function fetchAlloraInference(params: {
  baseUrl: string;
  chainId: string;
  topicId: number;
  apiKey?: string;
}): Promise<AlloraInference> {
  const base = params.baseUrl.replace(/\/$/u, '');
  const query = new URLSearchParams({ allora_topic_id: params.topicId.toString() });
  const url = `${base}/v2/allora/consumer/${params.chainId}?${query.toString()}`;
  const response = await fetch(url, {
    headers: params.apiKey ? { 'x-api-key': params.apiKey } : undefined,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Allora API request failed (${response.status}): ${bodyText}`);
  }

  const payload = bodyText.trim().length > 0 ? (JSON.parse(bodyText) as unknown) : {};
  return parseAlloraInferenceResponse(payload);
}
