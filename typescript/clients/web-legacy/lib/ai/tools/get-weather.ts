import { tool } from 'ai';
import { z } from 'zod';

const parametersSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const getWeather = tool({
  description: 'Get the current weather at a location',
  parameters: parametersSchema,
  // @ts-ignore - AI SDK v5 tool types have compatibility issues with parameter inference
  execute: async ({ latitude, longitude }: any) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
    );
    console.log('Weather API response:', response);
    const weatherData = await response.json();
    return weatherData;
  },
}) as any;
