import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { WalletProvider } from "@/components/wallet/WalletProvider";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"),
  title: {
    default: "Cobia — verified X Layer routes",
    template: "%s · Cobia",
  },
  description: "Intent-first DeFi on X Layer: bounded solvers search Aave, Curve, and Uniswap routes, then Cobia verifies the public proof and token outcomes before mainnet execution.",
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
