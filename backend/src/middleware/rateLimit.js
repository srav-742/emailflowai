const { rateLimit } = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const redis = require("../redisClient");

const upstashRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: new RedisStore({
    // @ts-expect-error - Known issue: the `rate-limit-redis` package has a slightly different type expectation
    sendCommand: (...args) => redis.call(...args),
  }),
  message: "Too many requests, please try again later.",
});

module.exports = upstashRateLimit;
