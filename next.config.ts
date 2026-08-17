import type { NextConfig } from "next";

// When deploying to GitHub Pages project site (username.github.io/<repo>/),
// set BASE_PATH=/<repo> at build time. Empty for Firebase Hosting / local.
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  // Fully client-side app → export as static files for easy hosting
  // (Firebase Hosting, Netlify, GitHub Pages, etc.)
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // الشريط السفلي يكتب `href` أصلياً على روابطه (تعمل قبل الترطيب، ومع الضغط
  // المطوّل، وكشبكةِ أمانٍ إن تعثّر التنقّل الداخليّ) — فيحتاج المسارَ الذي
  // يضيفه `next/link` عنّا على GitHub Pages.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
