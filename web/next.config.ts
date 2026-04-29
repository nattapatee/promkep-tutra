import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a standalone server bundle so the Docker runtime image only needs
  // `.next/standalone` + `.next/static` + `public/` (no full node_modules copy).
  output: "standalone",
};

export default nextConfig;
