import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

import { sendSlackMessage } from "../utils/slack.js";

let redisReady = false;

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not defined in the environment");
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    enableReadyCheck: false,
    lazyConnect: false,
    reconnectOnError: () => false,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 500, 2000);
    },
  });

  client.on("ready", () => {
    console.log("[Redis] Connected ✓");
    redisReady = true;
  });

  client.on("error", (err) => {
    if (redisReady) {
      console.error("[Redis] Connection lost:", err.message);
      sendSlackMessage(`Server Redis Connection lost: ${err.message}`);
    } else {
      sendSlackMessage(`Server Redis Connection error: ${err.message}`);
    }
    redisReady = false;
  });

  client.on("close", () => {
    sendSlackMessage("Server Redis Connection closed");
    redisReady = false;
  });

  return client;
}

export const redis = createRedisClient();

export function isRedisReady() {
  return redisReady === true;
}
