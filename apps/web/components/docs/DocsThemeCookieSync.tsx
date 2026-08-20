"use client";

import { useEffect } from "react";
import { useTheme } from "fumadocs-ui/provider/base";

const COOKIE_MAX_AGE_SECONDS = 31_536_000;

export function DocsThemeCookieSync() {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme !== "dark" && theme !== "light" && theme !== "system") return;
    document.cookie = `cobia-theme=${theme}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }, [theme]);

  return null;
}
