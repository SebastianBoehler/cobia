import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "./site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/requests/new", "/markets", "/terms"].map((path) => ({
    url: new URL(path, SITE_ORIGIN).toString(),
    changeFrequency: path === "/markets" ? "hourly" : "weekly",
    priority: path === "/" ? 1 : path === "/requests/new" ? 0.9 : 0.7,
  }));
}
