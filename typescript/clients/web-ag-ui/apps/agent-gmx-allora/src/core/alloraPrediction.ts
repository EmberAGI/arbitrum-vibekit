import type { AlloraInference } from '../clients/allora.js';
import type { AlloraPrediction } from '../domain/types.js';

type BuildAlloraPredictionParams = {
  inference: AlloraInference;
  currentPrice: number;
  topic: string;
  horizonHours: number;
  now?: Date;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function deriveConfidence(inference: AlloraInference): number {
  const values = inference.confidenceIntervalValues;
  const lower = values[1] ?? values[0] ?? inference.combinedValue;
  const upper = values[3] ?? values[values.length - 1] ?? inference.combinedValue;
  const spread = Math.abs(upper - lower);
  const normalizedSpread = spread / Math.max(Math.abs(inference.combinedValue), 1);
  const confidence = clamp(1 - normalizedSpread, 0, 1);
  return Number(confidence.toFixed(2));
}

export function buildAlloraPrediction(params: BuildAlloraPredictionParams): AlloraPrediction {
  const direction = params.inference.combinedValue >= params.currentPrice ? 'up' : 'down';
  const confidence = deriveConfidence(params.inference);

  return {
    topic: params.topic,
    horizonHours: params.horizonHours,
    confidence,
    direction,
    predictedPrice: params.inference.combinedValue,
    timestamp: (params.now ?? new Date()).toISOString(),
  };
}
