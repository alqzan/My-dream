import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app → export as static files for easy hosting
  // (Firebase Hosting, Netlify, GitHub Pages, etc.)
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
