import type { MetadataRoute } from "next";

/**
 * The web app manifest (/manifest.webmanifest): what a phone needs to install
 * MeuBov on its home screen. The icons are drawn by cli/renderIcons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeuBov",
    short_name: "MeuBov",
    description: "Gestão de rebanho bovino de corte, também no curral sem sinal.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#3e7150",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
