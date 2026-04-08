import type { ServerResponse } from 'node:http';

export function sendSuccess<T>(res: ServerResponse, data: T, message = 'Success', statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      success: true,
      message,
      data,
    }),
  );
}

export function sendError(res: ServerResponse, message: string, statusCode = 500) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      success: false,
      message,
    }),
  );
}
