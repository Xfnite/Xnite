import { NextRequest, NextResponse } from "next/server";
import { redis, isRedisReady } from "./redis";

interface RateLimitConfig {
  limit?: number;        // Maximum number of requests allowed in the window
  windowSeconds?: number; // Time window in seconds
}

export function withRateLimit(
  handler: (request: NextRequest, ...args: any[]) => Promise<Response> | Response,
  config?: RateLimitConfig
) {
  return async (request: NextRequest, ...args: any[]) => {
    // Determine the IP address of the client
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
      
    const path = request.nextUrl.pathname;
    const limit = config?.limit ?? 100; // default to 100 requests
    const windowSeconds = config?.windowSeconds ?? 60; // per 60 seconds

    if (isRedisReady()) {
      try {
        const key = `ratelimit:${ip}:${path}`;
        const current = await redis.incr(key);

        if (current === 1) {
          await redis.expire(key, windowSeconds);
        }

        if (current > limit) {
          console.warn(`[RateLimit] Blocked request from ${ip} to ${path} (limit exceeded: ${current}/${limit})`);
          return NextResponse.json(
            { success: false, error: "Too many requests. Please try again later." },
            {
              status: 429,
              headers: {
                "Retry-After": windowSeconds.toString(),
              },
            }
          );
        }
      } catch (err) {
        console.error("[RateLimit] Redis error, bypassing limit check:", err);
      }
    }

    // Call the original route handler
    return handler(request, ...args);
  };
}
