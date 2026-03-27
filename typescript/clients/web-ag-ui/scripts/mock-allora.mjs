import http from 'node:http';

const portRaw = process.env.PORT;
const port = portRaw ? Number(portRaw) : 0;
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`PORT must be a positive number (got: ${String(portRaw)})`);
}

const cycleMsRaw = process.env.ALLORA_MOCK_CYCLE_MS;
const cycleMs = cycleMsRaw ? Number(cycleMsRaw) : 30_000;
if (!Number.isFinite(cycleMs) || cycleMs <= 0) {
  throw new Error(
    `ALLORA_MOCK_CYCLE_MS must be a positive number (got: ${String(
      cycleMsRaw,
    )})`,
  );
}
const firstRequestAtByTopic = {};

function resolveCombinedValue(topicId) {
  if (topicId !== '14' && topicId !== '2') {
    return '100';
  }

  const firstRequestAt = firstRequestAtByTopic[topicId] ?? Date.now();
  firstRequestAtByTopic[topicId] = firstRequestAt;

  // Keep every request inside the same cycle window identical, then flip the
  // fingerprint when the next 30s window begins. This makes QA deterministic
  // even when multiple threads or retries consume extra requests between cycles.
  const cycleIndex = Math.floor((Date.now() - firstRequestAt) / cycleMs);
  const bucket = Math.floor(cycleIndex / 2);
  const phase = cycleIndex % 2;
  return phase === 0 ? String(1 + bucket) : String(100000 + bucket);
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
  const combined = resolveCombinedValue(topicId);

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
