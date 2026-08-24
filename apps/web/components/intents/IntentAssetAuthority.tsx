import {
  INTENT_ASSETS, NATIVE_INTENT_ASSET, RWA_INTENT_ASSETS, type IntentReceiptValues,
} from "../../lib/intents/capability-templates";
import type { ComposedIntentDraft } from "../../lib/intents/composition-draft";
import type { GeneralAssetDraftV1 } from "../../lib/intents/general-asset-draft";
import type { StagedConversionDraft } from "../../lib/intents/staged-conversion-draft";

type Values = IntentReceiptValues | ComposedIntentDraft | StagedConversionDraft | GeneralAssetDraftV1;

function assetLabel(address: string): string {
  if (address.toLowerCase() === NATIVE_INTENT_ASSET.address.toLowerCase()) return "native OKB";
  return [...INTENT_ASSETS, ...RWA_INTENT_ASSETS].find(({ address: candidate }) =>
    candidate.toLowerCase() === address.toLowerCase())?.symbol ?? address;
}

function authority(values: Values): { spend: string; receive: string } {
  if ("kind" in values && values.kind === "staged-conversion") return {
    spend: values.inputs.map((input) =>
      `${input.amount} ${input.kind === "native" ? `native ${input.symbol}` : input.symbol}`).join(" + "),
    receive: `At least ${values.minimum} ${values.outputSymbol}`,
  };
  if ("kind" in values && values.kind === "composed") return {
    spend: `${values.amount} ${assetLabel(values.inputToken)}`,
    receive: values.terminalAsset
      ? `Registered receipt in ${assetLabel(values.terminalAsset)}` : "Any registered receipt asset",
  };
  if ("kind" in values && values.kind === "general-asset-draft") return {
    spend: `${values.input.maximumAtomic} atomic ${values.input.symbol}`,
    receive: `At least ${values.output.minimumAtomic} atomic ${values.output.symbol}`,
  };

  const input = assetLabel(values.inputToken);
  const output = assetLabel(values.outputToken);
  if (values.templateId === "aave-supply") return {
    spend: `${values.amount} ${input}`,
    receive: `Verified Aave receipt for ${input}`,
  };
  if (values.templateId === "round-trip") return {
    spend: `${values.amount} ${input}`,
    receive: `More ${output} than the signed input`,
  };
  return { spend: `${values.amount} ${input}`, receive: `At least ${values.minimum} ${output}` };
}

export function IntentAssetAuthority({ values }: { values: Values }) {
  const flow = authority(values);
  return <section aria-label="Asset authority" className="intent-asset-authority">
    <div><span>Spend up to</span><strong>{flow.spend}</strong></div>
    <span aria-hidden="true" className="intent-asset-authority__arrow">→</span>
    <div><span>Receive</span><strong>{flow.receive}</strong></div>
  </section>;
}
