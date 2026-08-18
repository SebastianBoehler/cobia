import { headers } from "next/headers";
import { resolveSiteNetwork } from "./site-network";

export async function getSiteNetwork() {
  const incoming = await headers();
  const host = incoming.get("host") ?? incoming.get("x-forwarded-host") ?? "";
  return resolveSiteNetwork(host);
}
