import http from 'node:http';

const portRaw = process.env.PORT;
const port = portRaw ? Number(portRaw) : 0;
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`PORT must be a positive number (got: ${String(portRaw)})`);
}

const counters = {};
const stableWindowRequestsRaw = process.env.ALLORA_MOCK_STABLE_WINDOW_REQUESTS;
const stableWindowRequests = stableWindowRequestsRaw ? Number(stableWindowRequestsRaw) : 3;
if (!Number.isFinite(stableWindowRequests) || stableWindowRequests <= 0) {
  throw new Error(
    `ALLORA_MOCK_STABLE_WINDOW_REQUESTS must be a positive number (got: ${String(
      stableWindowRequestsRaw,
    )})`,
  );
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Missing URL');
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const match = url.pathname.match(/^\/v2\/allora\/consumer\/(.+)$/u);
  if (!match) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  const topicId = url.searchParams.get('allora_topic_id') ?? '0';

  // BTC=14, ETH=2 (8h feed); anything else is stable.
  const combined = (() => {
    if (topicId !== '14' && topicId !== '2') {
      return '100';
    }
    const next = (counters[topicId] ?? 0) + 1;
    counters[topicId] = next;
    const phase = Math.floor((next - 1) / stableWindowRequests) % 2;
    return phase === 0 ? '1' : '100000';
  })();

  // eslint-disable-next-line no-console
  console.log(`[mock-allora] topic=${topicId} -> ${combined}`);

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: true,
      data: {
        inference_data: {
          topic_id: topicId,
          network_inference_normalized: combined,
        },
      },
    }),
  );
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve mock Allora server address.');
  }
  // Printed for humans.
  // eslint-disable-next-line no-console
  console.log(`[mock-allora] listening http://127.0.0.1:${address.port}`);
});
