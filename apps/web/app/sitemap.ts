import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "./site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/intents/new", "/discover", "/network", "/solvers", "/buildx", "/terms"].map((path) => ({
    url: new URL(path, SITE_ORIGIN).toString(),
    changeFrequency: path === "/discover" ? "hourly" : "weekly",
    priority: path === "/" ? 1 : path === "/intents/new" ? 0.9 : 0.7,
  }));
}
