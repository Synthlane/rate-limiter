const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

class TokenBucket {
  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is not set');
    }

    this.redis = new Redis(redisUrl);
    const luaPath = path.join(__dirname, 'consume.lua');
    this.consumeScript = fs.readFileSync(luaPath, 'utf8');
  }

  bucketKey(clientId) {
    return `ratelimit:${clientId}`;
  }

  async initBucket(clientId, capacity, refillRate) {
    const key = this.bucketKey(clientId);
    await this.redis.hset(key, {
      clientId,
      capacity: String(capacity),
      refillRate: String(refillRate),
      tokens: String(capacity),
      version: '0',
      updatedAt: String(Date.now()),
    });
  }

  async getState(clientId) {
    return this.redis.hgetall(this.bucketKey(clientId));
  }

  async unsafeConsume(clientId) {
    const key = this.bucketKey(clientId);

    const tokensRaw = await this.redis.hget(key, 'tokens');
    const versionRaw = await this.redis.hget(key, 'version');

    const tokens = Number(tokensRaw || '0');
    const version = Number(versionRaw || '0');

    if (tokens <= 0) {
      return { allowed: 0, tokensLeft: 0, version };
    }

    const newTokens = tokens - 1;
    const newVersion = version + 1;

    // Intentionally non-atomic and race-prone.
    await this.redis.hset(key, {
      tokens: String(newTokens),
      version: String(newVersion),
      updatedAt: String(Date.now()),
    });

    return { allowed: 1, tokensLeft: newTokens, version: newVersion };
  }

  async atomicConsume(clientId) {
    const result = await this.redis.eval(this.consumeScript, 1, this.bucketKey(clientId));
    return {
      allowed: Number(result[0]),
      tokensLeft: Number(result[1]),
      version: Number(result[2]),
    };
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

module.exports = TokenBucket;
