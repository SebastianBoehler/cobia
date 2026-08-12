import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SOCIAL_IMAGE } from "./site-metadata";
import "./globals.css";
import "./styles/landing.css";
import "./styles/request.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: {
    default: "Cobia — Verified DeFi Routes on X Layer",
    template: "%s · Cobia",
  },
  description: SITE_DESCRIPTION,
  keywords: ["X Layer", "DeFi intents", "DeFi solver", "yield routes", "Aave V3", "Curve", "Uniswap V3", "non-custodial DeFi"],
  authors: [{ name: SITE_NAME, url: SITE_ORIGIN }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { address: false, email: false, telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Cobia — Verified DeFi Routes on X Layer",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    site: "@Cobia_Web3",
    creator: "@Cobia_Web3",
    title: "Cobia — Verified DeFi Routes on X Layer",
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6faf6" },
    { media: "(prefers-color-scheme: dark)", color: "#07110d" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const savedTheme = (await cookies()).get("cobia-theme")?.value;
  const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : undefined;
  return (
    <html
      lang="en"
      data-theme={theme}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
