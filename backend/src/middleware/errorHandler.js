const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number(err?.statusCode || err?.status || 500);
  const message = err?.message || 'Internal Server Error';

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    status,
    message,
    stack: err?.stack,
  });

  const payload = {
    success: false,
    message,
  };

  if (process.env.NODE_ENV !== 'production' && err?.details) {
    payload.details = err.details;
  }

  return res.status(status).json(payload);
}

module.exports = { errorHandler };
