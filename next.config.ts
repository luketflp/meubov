import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      // The Coberturas screen was renamed Reprodução; old bookmarks still land.
      {
        source: "/nascimentos/coberturas",
        destination: "/nascimentos/reproducao",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
