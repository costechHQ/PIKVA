import path from "node:path";
import type { NextConfig } from "next";

// Sent with every page and API answer (SRS 21.1).
const SECURITY_HEADERS = [
  // Never shown inside another site's frame (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Other sites see only our origin, never page paths or query strings.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays allowed for this site only: gate QR scanning (SRS 18.6).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the project root so a lockfile in a parent folder is never used.
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // API answers carry signed-in data (and pickup codes): never cache them.
      // Signed-in pages use getServerSideProps, which Next.js already sends as no-store.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
