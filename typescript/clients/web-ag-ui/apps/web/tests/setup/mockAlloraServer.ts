import http from 'node:http';

function resolvePort(): number {
  const raw = process.env['PORT'];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

const port = resolvePort();

const counters: Record<string, number> = {};
const STABLE_WINDOW_REQUESTS = 3;

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
  // Alternate between two extremes so UIs/tests can easily detect when they're
  // using the mock vs a static/stale value.
  // BTC=14, ETH=2 (8h feed); any other topic returns a stable default.
  const combined = (() => {
    if (topicId !== '14' && topicId !== '2') {
      return '100';
    }
    const next = (counters[topicId] ?? 0) + 1;
    counters[topicId] = next;
    const phase = Math.floor((next - 1) / STABLE_WINDOW_REQUESTS) % 2;
    return phase === 0 ? '1' : '100000';
  })();

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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  // Printed for humans; in persist mode we use a fixed port anyway.
  console.log(`[mock-allora] listening ${baseUrl}`);
});
