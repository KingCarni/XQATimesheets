import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Contract attachments are capped at 5 MB (enforced again server-side).
      // Leave headroom for multipart boundary/field overhead on top of that.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
