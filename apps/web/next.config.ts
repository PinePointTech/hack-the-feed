import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      // The root URL serves the v3 landing from the static preview copy.
      beforeFiles: [{ source: "/", destination: "/preview/v3.html" }],
    };
  },
};

export default nextConfig;
