import Redis from "ioredis";

import { sendSlackMessage } from "./slack";

// ─── Singleton pattern for Next.js hot-reload compatibility ──────────────────
const globalForRedis = global as unknown as {
  redis?: Redis;
  redisReady?: boolean;
};

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not defined");
  }

  const client = new Redis(url, {
    // Do NOT throw on failed commands when disconnected
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    enableReadyCheck: false,
    lazyConnect: false,
    // Reconnect strategy: give up after 3 attempts to avoid log spam
    reconnectOnError: () => false,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 500, 2000);
    },
  });

  client.on("ready", () => {
    console.log("[Redis] Connected ✓");
    globalForRedis.redisReady = true;
  });

  client.on("error", (err) => {
    if (globalForRedis.redisReady) {
      console.error("[Redis] Connection lost:", err.message);
      sendSlackMessage(`Frontend Redis Connection lost: ${err.message}`);
    } else {
      sendSlackMessage(`Frontend Redis Connection error: ${err.message}`);
    }
    globalForRedis.redisReady = false;
  });

  client.on("close", () => {
    sendSlackMessage("Frontend Redis Connection closed");
    globalForRedis.redisReady = false;
  });

  return client;
}

if (!globalForRedis.redis) {
  globalForRedis.redis = createRedisClient();
  globalForRedis.redisReady = false;
}

export const redis = globalForRedis.redis;

/** Returns true only when Redis is actually connected and ready */
export function isRedisReady(): boolean {
  return globalForRedis.redisReady === true;
}
