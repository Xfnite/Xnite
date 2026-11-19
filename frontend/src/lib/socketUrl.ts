export function getDefaultSocketUrl(): string {
  if (typeof window !== "undefined") {
    if (
      process.env.NEXT_PUBLIC_SERVER_URL &&
      !process.env.NEXT_PUBLIC_SERVER_URL.includes("localhost")
    ) {
      return process.env.NEXT_PUBLIC_SERVER_URL;
    }
    if (
      process.env.NEXT_PUBLIC_SOCKET_URL &&
      !process.env.NEXT_PUBLIC_SOCKET_URL.includes("localhost")
    ) {
      return process.env.NEXT_PUBLIC_SOCKET_URL;
    }
    const hostname = window.location.hostname;
    if (hostname.includes("staging.xfnite.cloud")) {
      return "https://staging-server.xfnite.cloud";
    }
    if (hostname.includes("xfnite.cloud")) {
      return "https://server.xfnite.cloud";
    }
  }
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    "http://localhost:3001"
  );
}

let cachedSocketUrlPromise: Promise<string> | null = null;

/**
 * Resolves the Socket.io server URL. When running locally on localhost/127.0.0.1,
 * prefers a running local backend on :3001 so local server changes work even when
 * .env points NEXT_PUBLIC_SERVER_URL at production.
 */
export function resolveSocketUrl(): Promise<string> {
  if (typeof window === "undefined") {
    return Promise.resolve(getDefaultSocketUrl());
  }

  if (cachedSocketUrlPromise) {
    return cachedSocketUrlPromise;
  }

  const hostname = window.location.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isLocalHost) {
    cachedSocketUrlPromise = Promise.resolve(getDefaultSocketUrl());
    return cachedSocketUrlPromise;
  }

  cachedSocketUrlPromise = (async () => {
    const localUrl = "http://localhost:3001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    try {
      const res = await fetch(`${localUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      if (res.ok) {
        return localUrl;
      }
    } catch {
      // Local backend not running; fall back to configured URL
    } finally {
      clearTimeout(timeout);
    }
    return getDefaultSocketUrl();
  })();

  return cachedSocketUrlPromise;
}
