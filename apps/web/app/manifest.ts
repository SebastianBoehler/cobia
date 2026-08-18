import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cobia — Verified onchain intents",
    short_name: "Cobia",
    description: "Describe a bounded onchain outcome and review independently verified solver programs.",
    start_url: "/intents/new",
    display: "standalone",
    background_color: "#f6faf6",
    theme_color: "#3655ff",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
