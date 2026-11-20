import type { NextConfig } from "next";
import path from "path";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com https://connect.facebook.net https://www.youtube.com https://s.ytimg.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https://biltph.com https://uploadthing.com https://*.uploadthing.com https://*.googleusercontent.com https://*.facebook.com https://*.fbcdn.net https://*.ytimg.com https://*.youtube.com;
  font-src 'self' https://fonts.gstatic.com data:;
  connect-src 'self' https://*.xfnite.cloud wss://*.xfnite.cloud ws://localhost:* https://accounts.google.com https://uploadthing.com https://*.uploadthing.com https://*.googleusercontent.com https://graph.facebook.com https://*.youtube.com https://*.googlevideo.com;
  frame-src 'self' https://accounts.google.com https://www.facebook.com https://www.youtube.com https://www.youtube-nocookie.com;
  frame-ancestors 'none';
  form-action 'self' https://accounts.google.com https://www.facebook.com;
  base-uri 'self';
  object-src 'none';
`.replace(/\s{2,}/g, ' ').trim();

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspHeader,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "biltph.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ["192.168.1.65", "192.168.1.55", "192.168.1.25"],
  async redirects() {
    return [
      {
        source: "/registration",
        destination: "/register",
        permanent: false,
      },
      {
        source: "/registration/:path*",
        destination: "/register",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  turbopack: {
    root: path.resolve(import.meta.dirname || '.', '..'),
  },
};

export default nextConfig;
