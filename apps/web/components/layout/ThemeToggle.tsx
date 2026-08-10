"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggle(): void {
    const root = document.documentElement;
    const current = root.dataset.theme
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("cobia-theme", next);
    document.cookie = `cobia-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <button className="theme-toggle" type="button" aria-label="Toggle color theme" onClick={toggle}>
      <Sun className="theme-toggle__sun" size={16} />
      <Moon className="theme-toggle__moon" size={16} />
    </button>
  );
}
