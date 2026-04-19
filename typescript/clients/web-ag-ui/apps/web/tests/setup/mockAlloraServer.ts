import http from 'node:http';

function resolvePort(): number {
  const raw = process.env['PORT'];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

const port = resolvePort();

const CYCLE_MS = 30_000;
const firstRequestAtByTopic: Record<string, number> = {};

function resolveCombinedValue(topicId: string): string {
  if (topicId !== '14' && topicId !== '2') {
    return '100';
  }

  const firstRequestAt = firstRequestAtByTopic[topicId] ?? Date.now();
  firstRequestAtByTopic[topicId] = firstRequestAt;

  const cycleIndex = Math.floor((Date.now() - firstRequestAt) / CYCLE_MS);
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
