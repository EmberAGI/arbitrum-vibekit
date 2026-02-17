/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { Readable } from 'stream';

export function createExpressMocks(request: NextRequest, body?: string, parsedBody?: unknown) {
  const bodyStream = new Readable({
    read() {
      if (body) {
        this.push(body);
        this.push(null);
      } else {
        this.push(null);
      }
    },
  });

  const mockReq = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body: parsedBody,
    readable: true,
    readableEnded: false,
    pipe: (destination: any) => {
      bodyStream.pipe(destination);
      return destination;
    },
    on: (event: string, handler: (...args: any[]) => void) => {
      bodyStream.on(event, handler as any);
      return mockReq;
    },
    once: (event: string, handler: (...args: any[]) => void) => {
      bodyStream.once(event, handler as any);
      return mockReq;
    },
    emit: (event: string, ...args: any[]) => {
      return bodyStream.emit(event, ...args);
    },
    get: (header: string) => request.headers.get(header.toLowerCase()),
    header: (header: string) => request.headers.get(header.toLowerCase()),
    text: async () => body || '',
    json: async () => parsedBody,
    protocol: new URL(request.url).protocol.replace(':', ''),
    secure: new URL(request.url).protocol === 'https:',
    ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
    path: new URL(request.url).pathname,
    hostname: new URL(request.url).hostname,
    query: Object.fromEntries(new URL(request.url).searchParams),
    params: {},
    is: (type: string) => (request.headers.get('content-type') || '').includes(type),
  } as any;

  return mockReq;
}

export function createExpressResponse(
  onComplete: (data: { status: number; headers: Headers; body: string }) => void,
) {
  let statusCode = 200;
  const headers = new Headers();
  const chunks: Buffer[] = [];
  let headersSent = false;
  let finished = false;

  const mockRes = {
    statusCode,
    statusMessage: 'OK',
    status: function (code: number) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    headersSent,
    setHeader: function (name: string, value: string | string[]) {
      if (headersSent) return this;
      if (Array.isArray(value)) {
        headers.set(name, value.join(', '));
      } else {
        headers.set(name, value);
      }
      return this;
    },
    getHeader: function (name: string) {
      return headers.get(name);
    },
    writeHead: function (code: number, statusMessage?: string | any, hdrs?: any) {
      if (headersSent) return this;
      statusCode = code;
      this.statusCode = code;
      if (typeof statusMessage === 'string') {
        this.statusMessage = statusMessage;
      } else if (statusMessage) {
        hdrs = statusMessage;
      }
      if (hdrs) {
        Object.entries(hdrs).forEach(([key, value]) => {
          this.setHeader(key, value as string);
        });
      }
      headersSent = true;
      this.headersSent = true;
      return this;
    },
    flushHeaders: function () {
      if (!headersSent) {
        this.writeHead(statusCode);
      }
      return this;
    },
    write: function (chunk: any, encoding?: string) {
      if (finished) return false;
      if (!headersSent) {
        this.writeHead(statusCode);
      }
      let buffer: Buffer;
      if (Buffer.isBuffer(chunk)) {
        buffer = chunk;
      } else if (typeof chunk === 'string') {
        buffer = Buffer.from(chunk, (encoding as any) || 'utf8');
      } else {
        buffer = Buffer.from(JSON.stringify(chunk));
      }
      chunks.push(buffer);
      return true;
    },
    end: function (data?: any, encoding?: string) {
      if (finished) return this;
      if (data) {
        this.write(data, encoding);
      }
      if (!headersSent) {
        this.writeHead(statusCode);
      }
      finished = true;
      this.finished = true;
      const body = Buffer.concat(chunks).toString('utf8');
      onComplete({ status: statusCode, headers, body });
      return this;
    },
    json: function (obj: any) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(obj));
      return this;
    },
    send: function (body: any) {
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        return this.json(body);
      }
      this.end(body);
      return this;
    },
    finished,
    connection: { remoteAddress: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    on: function (_event: string, _handler: (...args: any[]) => void) {
      return this;
    },
    emit: function (_event: string, ..._args: any[]) {
      return true;
    },
    set: function (field: string, value?: string) {
      if (arguments.length === 2) {
        this.setHeader(field, value!);
      }
      return this;
    },
    get: function (field: string) {
      return this.getHeader(field);
    },
    locals: {},
  } as any;

  return mockRes;
}
