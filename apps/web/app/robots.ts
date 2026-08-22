import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "./site-metadata";

const publicCrawlRules = {
  allow: "/",
  disallow: ["/api/", "/programs/"],
};

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["OAI-SearchBot", "GPTBot", "ChatGPT-User"],
        ...publicCrawlRules,
      },
      { userAgent: "*", ...publicCrawlRules },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
