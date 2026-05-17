import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist", "tesseract.js"],
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
};

export default nextConfig;
