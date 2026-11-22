import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests run their own dev server; a separate build folder lets it run alongside `npm run dev`.
  ...(process.env.KICKADS_E2E === "1" ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
