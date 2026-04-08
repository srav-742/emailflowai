// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sendError } from '../utils/apiResponse';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  logger.error(`${req.method} ${req.path} - ${err.message}`, {
    stack: err.stack,
  });

  if (err instanceof AppError && err.isOperational) {
    sendError(res, err.message, err.statusCode, err.stack);
    return;
  }

  // Prisma known errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === 'P2002') {
      sendError(res, 'A record with this value already exists.', 409);
      return;
    }
    if (prismaErr.code === 'P2025') {
      sendError(res, 'Record not found.', 404);
      return;
    }
  }

  // Generic server error
  sendError(
    res,
    'Something went wrong on our end. Please try again.',
    500,
    process.env.NODE_ENV === 'development' ? err.stack : undefined
  );
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, `Route ${req.method} ${req.path} not found`, 404);
};