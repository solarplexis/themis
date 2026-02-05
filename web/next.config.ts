import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Turbopack configuration for development
  ...(process.env.NODE_ENV === 'development' && {
    turbopack: {
      root: path.resolve(__dirname),
    },
  }),
};

export default nextConfig;
