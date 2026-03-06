export const decodeInterruptPayload = (payload: unknown): unknown => {
  if (typeof payload !== 'string') {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

export const requestInterruptPayload = async <TRequest>(params: {
  request: TRequest;
  interrupt: (request: TRequest) => Promise<unknown>;
}): Promise<{ raw: unknown; decoded: unknown }> => {
  const raw = await params.interrupt(params.request);
  return {
    raw,
    decoded: decodeInterruptPayload(raw),
  };
};
