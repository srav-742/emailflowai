function serializeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  return Object.entries(meta).reduce((acc, [key, value]) => {
    if (value instanceof Error) {
      acc[key] = {
        message: value.message,
        stack: value.stack,
        name: value.name,
      };
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

function createFallbackLogger() {
  const write = (level, message, meta = {}) => {
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: 'emailflow-backend',
      ...serializeMeta(meta),
    };

    const text = JSON.stringify(payload);

    if (level === 'error') {
      console.error(text);
      return;
    }

    if (level === 'warn') {
      console.warn(text);
      return;
    }

    console.log(text);
  };

  return {
    error: (message, meta) => write('error', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    info: (message, meta) => write('info', message, meta),
    debug: (message, meta) => write('debug', message, meta),
  };
}

let logger = createFallbackLogger();

try {
  const winston = require('winston');

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    defaultMeta: {
      service: 'emailflow-backend',
    },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console(),
    ],
  });
} catch (error) {
  logger.warn('Winston not installed yet, using console logger fallback.', {
    dependency: 'winston',
  });
}

module.exports = logger;
