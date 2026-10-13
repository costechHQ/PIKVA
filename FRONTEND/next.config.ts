import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Pin the project root so a lockfile in a parent folder is never used.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
