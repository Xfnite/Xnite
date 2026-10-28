import { NextRequest, NextResponse } from "next/server";
import { redis, isRedisReady } from "./redis";

interface IdempotencyOptions {
  ttlSeconds?: number; // How long to store the result (default: 24 hours)
}

export function withIdempotency(
  handler: (request: NextRequest, ...args: any[]) => Promise<Response> | Response,
  options?: IdempotencyOptions
) {
  return async (request: NextRequest, ...args: any[]) => {
    // Only apply idempotency to POST/write requests
    if (request.method !== "POST") {
      return handler(request, ...args);
    }

    const idempotencyKey = request.headers.get("x-idempotency-key");
    if (!idempotencyKey) {
      // If the client did not provide a key, proceed normally
      return handler(request, ...args);
    }

    if (!isRedisReady()) {
      return handler(request, ...args);
    }

    const ttl = options?.ttlSeconds ?? 86400; // 24 hours
    const redisKey = `idempotency:${idempotencyKey}`;

    try {
      // Try to acquire lock using NX (Set if Not Exists)
      const isNew = await redis.set(redisKey, "in_progress", "EX", ttl, "NX");

      if (!isNew) {
        // Key already exists. Check the state.
        const state = await redis.get(redisKey);
        
        if (state === "in_progress") {
          console.warn(`[Idempotency] Request for key ${idempotencyKey} is already in progress.`);
          return NextResponse.json(
            { success: false, error: "A request with this idempotency key is currently in progress." },
            { status: 409 }
          );
        }

        // Return the saved response
        try {
          const savedResponse = JSON.parse(state || "");
          console.log(`[Idempotency] Returning cached response for key ${idempotencyKey}`);
          return new NextResponse(
            JSON.stringify(savedResponse.body),
            {
              status: savedResponse.status,
              headers: {
                "Content-Type": "application/json",
                "X-Cache-Idempotent": "true",
              },
            }
          );
        } catch {
          return NextResponse.json(
            { success: false, error: "Duplicate request detected." },
            { status: 409 }
          );
        }
      }

      // Execute the actual handler
      const response = await handler(request, ...args);

      // Only cache successful or client-side errors (no 5xx server errors)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        try {
          const clone = response.clone();
          const bodyText = await clone.text();
          let bodyObj = null;
          try {
            bodyObj = JSON.parse(bodyText);
          } catch {
            bodyObj = { message: bodyText };
          }

          const cachePayload = {
            status: response.status,
            body: bodyObj,
          };
          await redis.set(redisKey, JSON.stringify(cachePayload), "EX", ttl);
        } catch (cacheErr) {
          console.error("[Idempotency] Failed to cache response in Redis:", cacheErr);
        }
      } else {
        // If it failed with a server error, remove the key so they can retry
        await redis.del(redisKey);
      }

      return response;
    } catch (err) {
      console.error("[Idempotency] Redis error during check, passing through:", err);
      return handler(request, ...args);
    }
  };
}
