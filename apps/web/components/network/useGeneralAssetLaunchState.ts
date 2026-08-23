"use client";

import { useEffect, useState } from "react";
import type { GeneralAssetLaunchState } from "../../lib/network/general-asset-launch-status";

export function useGeneralAssetLaunchState(): GeneralAssetLaunchState | undefined {
  const [state, setState] = useState<GeneralAssetLaunchState>();

  useEffect(() => {
    let active = true;
    fetch("/api/network/status", { cache: "no-store" })
      .then(async (response): Promise<{ v4?: { state?: GeneralAssetLaunchState } }> =>
        response.ok ? response.json() : {})
      .then((status) => {
        if (active && status.v4?.state) setState(status.v4.state);
      }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return state;
}
