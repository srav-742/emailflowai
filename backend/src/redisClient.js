const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

const redis = new Redis(redisUrl, {
  tls: redisUrl && redisUrl.startsWith("rediss://") ? {} : undefined,
  maxRetriesPerRequest: null
});

redis.on("connect", () => {
  console.log("✅ Redis Connected");
});

redis.on("error", (err) => {
  console.log("❌ Redis Error:", err);
});

module.exports = redis;
