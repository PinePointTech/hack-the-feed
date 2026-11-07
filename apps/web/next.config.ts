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
  // No root rewrite: "/" is the app's live landing, so nav, data and search match every page.
  // The static v3 design mock stays at /preview/v3.html.
};

export default nextConfig;
