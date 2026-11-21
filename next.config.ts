import type { NextConfig } from "next";

// Static export for GitHub Pages: a project site, so every path lives under /profile.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/profile",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
