const redis = require('../../redisClient');

/**
 * Get a value from the cache.
 */
async function get(key) {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`[Cache] Get error for key ${key}:`, error.message);
    return null; 
  }
}

/**
 * Set a value in the cache with a TTL.
 */
async function set(key, value, ttlSeconds) {
  try {
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.set(key, stringValue, 'EX', ttlSeconds);
    } else {
      await redis.set(key, stringValue);
    }
  } catch (error) {
    console.error(`[Cache] Set error for key ${key}:`, error.message);
  }
}

/**
 * Delete a value from the cache.
 */
async function del(key) {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`[Cache] Delete error for key ${key}:`, error.message);
  }
}

/**
 * Delete keys matching a pattern.
 */
async function delPattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`[Cache] delPattern error for ${pattern}:`, error.message);
  }
}

module.exports = {
  get,
  set,
  del,
  delPattern,
};
