import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/wallet/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/network/site-network-server", () => ({
  getSiteNetwork: async () => ({ mode: "mainnet", chainId: 196 }),
}));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
import { generateMetadata, viewport } from "./layout";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";
import { createPageMetadata, SITE_ORIGIN } from "./site-metadata";

const appDirectory = join(process.cwd(), "app");

describe("site metadata", () => {
  it("uses the public Cobia domain as the canonical origin", () => {
    expect(SITE_ORIGIN).toBe("https://getcobia.com");
  });

  it("publishes a complete Cobia social and search identity", async () => {
    const metadata = await generateMetadata();
    expect(metadata).toMatchObject({
      applicationName: "Cobia",
      title: {
        default: "Cobia — Verified onchain intents",
        template: "%s · Cobia",
      },
      openGraph: {
        type: "website",
        siteName: "Cobia",
        url: "/",
        images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        site: "@Cobia_Web3",
        creator: "@Cobia_Web3",
        images: ["/opengraph-image"],
      },
      manifest: "/manifest.webmanifest",
      appleWebApp: { capable: true, title: "Cobia", statusBarStyle: "black-translucent" },
    });
  });

  it("publishes light and dark browser chrome colors", () => {
    expect(viewport).toMatchObject({
      colorScheme: "light dark",
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f6faf6" },
        { media: "(prefers-color-scheme: dark)", color: "#07110d" },
      ],
    });
  });

  it("ships branded browser and Apple icons instead of the starter favicon", () => {
    const iconPath = join(appDirectory, "icon.png");
    const appleIconPath = join(appDirectory, "apple-icon.png");
    expect(existsSync(iconPath)).toBe(true);
    expect(existsSync(appleIconPath)).toBe(true);
    expect(readFileSync(join(appDirectory, "favicon.ico"))).not.toHaveLength(15406);
  });

  it("exposes crawl rules without indexing APIs or purchased bundles", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/programs/"] },
      sitemap: `${SITE_ORIGIN}/sitemap.xml`,
      host: SITE_ORIGIN,
    });
  });

  it("lists the stable public product pages in the sitemap", () => {
    expect(sitemap().map(({ url }) => url)).toEqual([
      `${SITE_ORIGIN}/`,
      `${SITE_ORIGIN}/intents/new`,
      `${SITE_ORIGIN}/discover`,
      `${SITE_ORIGIN}/solvers`,
      `${SITE_ORIGIN}/terms`,
    ]);
  });

  it("describes the installable Cobia experience", () => {
    const appManifest = manifest();
    expect(appManifest).toMatchObject({
      name: "Cobia — Verified onchain intents",
      short_name: "Cobia",
      start_url: "/intents/new",
      display: "standalone",
      theme_color: "#3655ff",
    });
    expect(appManifest.icons).toContainEqual({ src: "/icon.png", sizes: "512x512", type: "image/png" });
  });

  it("marks wallet-specific pages as non-indexable without losing social cards", () => {
    const page = createPageMetadata({
      title: "Proof Log",
      description: "Signed intents and execution events.",
      path: "/activity",
      index: false,
    });
    expect(page.alternates).toEqual({ canonical: "/activity" });
    expect(page.robots).toEqual({ index: false, follow: false });
    expect(page.openGraph).toMatchObject({ images: [{ url: "/opengraph-image" }] });
  });
});
