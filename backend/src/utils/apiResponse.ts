// src/utils/apiResponse.ts
import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
  meta?: ApiResponse['meta']
): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta && { meta }),
  } as ApiResponse<T>);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  error?: string
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(error && process.env.NODE_ENV === 'development' && { error }),
  } as ApiResponse);
};

export const sendCreated = <T>(res: Response, data: T, message = 'Created successfully'): Response =>
  sendSuccess(res, data, message, 201);

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message = 'Success'
): Response =>
  sendSuccess(res, data, message, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });