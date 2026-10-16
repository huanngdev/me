import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
  transpilePackages: ["@repo/core"],
  async redirects() {
    return [{ source: "/changelog", destination: "/", permanent: true }];
  },
};

export default nextConfig;
