import type { Metadata } from "next";

export const SITE_NAME = "Cobia";
export const SITE_DESCRIPTION = "Set bounded DeFi intents, compare verified Aave, Curve, and Uniswap routes, and execute non-custodially on X Layer.";
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://getcobia.com";
export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Cobia — verified DeFi routes on X Layer",
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: path,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      site: "@Cobia_Web3",
      creator: "@Cobia_Web3",
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [SOCIAL_IMAGE.url],
    },
    robots: { index, follow: index },
  };
}
