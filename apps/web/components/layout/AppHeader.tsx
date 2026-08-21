"use client";

import { ArrowUpRight, Bot, CirclePlus, Clock3, Compass, House, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CobiaLogo } from "../brand/CobiaLogo";
import { WalletButton } from "../wallet/WalletButton";
import { useWallet } from "../wallet/WalletProvider";
import { ThemeToggle } from "./ThemeToggle";
import { PublicLaunchBanner } from "./PublicLaunchBanner";

const navigation = [
  { href: "/intents/new", icon: CirclePlus, label: "Intent", prefixes: ["/intents", "/programs"] },
  { href: "/portfolio", icon: WalletCards, label: "Portfolio", prefixes: ["/portfolio"] },
  { href: "/activity", icon: Clock3, label: "Activity", prefixes: ["/activity"] },
  { href: "/discover", icon: Compass, label: "Discover", prefixes: ["/discover"] },
  { href: "/solvers", icon: Bot, label: "Solvers", prefixes: ["/solvers"] },
] as const;

const testnetNavigation = [
  { href: "/", icon: House, label: "Testnet home", prefixes: ["/"] },
  { href: "/portfolio", icon: WalletCards, label: "Portfolio", prefixes: ["/portfolio"] },
] as const;

export function AppHeader() {
  const pathname = usePathname() ?? "";
  const wallet = useWallet();
  const visibleNavigation = wallet.targetChainId === 1952 ? testnetNavigation : navigation;
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-header__brand">
          <CobiaLogo />
          <span className="network-label" title={wallet.networkName}>
            <span aria-hidden="true" className="network-label__dot" />
            {wallet.targetChainId === 1952 ? "Testnet" : "X Layer"}
          </span>
        </div>
        <nav className="app-header__nav" aria-label="Primary navigation" data-count={visibleNavigation.length}>
          {visibleNavigation.map(({ href, icon: Icon, label, prefixes }) => {
            const active = href === "/" ? pathname === "/" : prefixes.some((prefix) => pathname.startsWith(prefix));
            return (
              <Link aria-current={active ? "page" : undefined} href={href} key={href}>
                <Icon aria-hidden="true" className="app-header__nav-icon" size={20} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="app-header__actions">
          <div className="app-header__resources">
            <Link href="/docs">Docs</Link>
            <Link className="app-header__build-link" href="/docs/quickstart">
              Build a solver <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
          <ThemeToggle />
          <WalletButton />
        </div>
      </header>
      {wallet.targetChainId === 196 ? <PublicLaunchBanner /> : null}
    </>
  );
}
