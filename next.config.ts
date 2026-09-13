import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      // The Coberturas screen was renamed Reprodução; old bookmarks still land.
      {
        source: "/nascimentos/coberturas",
        destination: "/reproducao",
        permanent: true,
      },
      // Reprodução left Nascimentos for a sidebar tab of its own.
      {
        source: "/nascimentos/reproducao/:path*",
        destination: "/reproducao/:path*",
        permanent: true,
      },
      // A venda's record moved to its session's own page with every other manejo.
      {
        source: "/manejo/venda/:id",
        destination: "/manejo/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
