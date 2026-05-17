import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*"
    ],
  },
};

export default nextConfig;
