import { NetworkEthereum, NetworkXLayer, TokenPAXG } from "@web3icons/react";
import { Store } from "lucide-react";
import type { CSSProperties } from "react";
import { AssetMark } from "../brand/AssetMark";
import { ProtocolMark } from "../brand/ProtocolMark";

type IntentOptionGroup = "Assets" | "Networks" | "Protocols" | "Services";

function LetterMark({ label }: { label: string }) {
  return <span className="brand-mark brand-mark--other" style={{ "--brand-mark-size": "20px" } as CSSProperties}>
    {label.slice(0, 1).toUpperCase()}
  </span>;
}

export function IntentOptionMark({ group, mention }: { group: IntentOptionGroup; mention: string }) {
  const symbol = mention.toLowerCase();

  if (group === "Assets") {
    if (mention === "OKB" || mention === "USDG" || mention === "USDt0") {
      return <AssetMark asset={mention} size={20} />;
    }
    if (mention === "PAXG") return <span className="brand-mark" style={{ "--brand-mark-size": "20px" } as CSSProperties}>
      <TokenPAXG aria-hidden="true" size="100%" variant="background" />
    </span>;
    return <LetterMark label={mention} />;
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
