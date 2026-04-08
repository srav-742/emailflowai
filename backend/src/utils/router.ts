import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RouteContext<TBody = unknown> {
  req: IncomingMessage;
  res: ServerResponse;
  body: TBody;
  params: Record<string, string>;
  query: URLSearchParams;
  pathname: string;
}

type HttpMethod = 'GET' | 'POST';
type RouteHandler = (context: RouteContext) => Promise<void> | void;

interface RegisteredRoute {
  method: HttpMethod;
  keys: string[];
  pattern: RegExp;
  handler: RouteHandler;
}

function escapeSegment(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePath(pathname: string) {
  const keys: string[] = [];
  const pattern = pathname
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }

      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }

      return escapeSegment(segment);
    })
    .join('/');

  return {
    keys,
    pattern: new RegExp(`^${pattern}$`),
  };
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString('utf8');

  if (!raw.trim()) {
    return undefined;
  }

  return JSON.parse(raw) as unknown;
}

export class Router {
  private readonly routes: RegisteredRoute[] = [];

  get(pathname: string, handler: RouteHandler) {
    this.register('GET', pathname, handler);
  }

  post(pathname: string, handler: RouteHandler) {
    this.register('POST', pathname, handler);
  }

  private register(method: HttpMethod, pathname: string, handler: RouteHandler) {
    const compiled = compilePath(pathname);

    this.routes.push({
      method,
      keys: compiled.keys,
      pattern: compiled.pattern,
      handler,
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse) {
    const method = (req.method ?? 'GET').toUpperCase() as HttpMethod;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = this.routes.find((candidate) => {
      return candidate.method === method && candidate.pattern.test(url.pathname);
    });

    if (!route) {
      return false;
    }

    const match = url.pathname.match(route.pattern);
    const params = match
      ? route.keys.reduce<Record<string, string>>((accumulator, key, index) => {
          accumulator[key] = decodeURIComponent(match[index + 1] ?? '');
          return accumulator;
        }, {})
      : {};

    const body = method === 'POST' ? await readBody(req) : undefined;

    await route.handler({
      req,
      res,
      body,
      params,
      query: url.searchParams,
      pathname: url.pathname,
    });

    return true;
  }
}
