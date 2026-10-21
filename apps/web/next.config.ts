import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    turbopackRustReactCompiler: true,
  },
  transpilePackages: ["@repo/core"],
  // The MCP catalog reads public/r/*.json from disk at runtime. Public files are not traced
  // into the route's function bundle on their own.
  outputFileTracingIncludes: {
    "/mcp": ["./public/r/**/*.json"],
  },
  async redirects() {
    return [{ source: "/changelog", destination: "/", permanent: true }];
  },
};

export default nextConfig;
