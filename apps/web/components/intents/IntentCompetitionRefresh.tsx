"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 10_000;

export function IntentCompetitionRefresh({ closesAt }: { closesAt: string }) {
  const router = useRouter();

  useEffect(() => {
    const closesAtMs = Date.parse(closesAt);
    let timer: number | undefined;
    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const active = () => document.visibilityState === "visible" && Date.now() < closesAtMs;
    const schedule = () => {
      clear();
      if (!active()) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!active()) return;
        router.refresh();
        schedule();
      }, Math.min(REFRESH_INTERVAL_MS, closesAtMs - Date.now()));
    };
    const onVisibilityChange = () => {
      if (active()) router.refresh();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [closesAt, router]);

  return null;
}
