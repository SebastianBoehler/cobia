import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "Cobia — verified X Layer routes",
    template: "%s · Cobia",
  },
  description: "Pinned-block Aave V3, Curve StableSwap NG, and Uniswap V3 opportunities on X Layer, deterministically authorized before paid reveal and guided mainnet execution.",
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
      <body className="min-h-full flex flex-col"><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
