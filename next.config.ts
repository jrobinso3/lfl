import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubActions ? "/lfl" : "",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY || "",
  },
};

export default nextConfig;
