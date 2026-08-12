import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cobia — Verified DeFi Routes on X Layer",
    short_name: "Cobia",
    description: "Set bounded DeFi intents, compare verified routes, and execute non-custodially on X Layer.",
    start_url: "/requests/new",
    display: "standalone",
    background_color: "#f6faf6",
    theme_color: "#3655ff",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
