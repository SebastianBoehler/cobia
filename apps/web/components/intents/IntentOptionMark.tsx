import { NetworkEthereum, NetworkXLayer } from "@web3icons/react";
import { Store } from "lucide-react";
import type { CSSProperties } from "react";
import { ProtocolMark } from "../brand/ProtocolMark";
import { TokenAssetMark } from "../brand/TokenAssetMark";

type IntentOptionGroup = "Assets" | "Networks" | "Protocols" | "Services";

export function IntentOptionMark({ group, mention }: { group: IntentOptionGroup; mention: string }) {
  const symbol = mention.toLowerCase();

  if (group === "Assets") {
    return <TokenAssetMark size={20} symbol={mention} />;
  }
  if (group === "Networks") {
    const NetworkLogo = symbol === "xlayer" ? NetworkXLayer : NetworkEthereum;
    return <span className="brand-mark" style={{ "--brand-mark-size": "20px" } as CSSProperties}>
      <NetworkLogo aria-hidden="true" size="100%" variant="background" />
    </span>;
  }
  if (group === "Protocols") return <ProtocolMark protocol={mention} size={20} />;
  return <span className="brand-mark brand-mark--other" style={{ "--brand-mark-size": "20px" } as CSSProperties}>
    <Store aria-hidden="true" size={12} strokeWidth={1.8} />
  </span>;
}
