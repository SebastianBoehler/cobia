"use client";

import { commitment } from "@cobia/domain";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { keccak256, stringToHex } from "viem";
import { buildGeneralIntentPolicyV2 } from "../../lib/intents/general-policy";
import { decimalToAtomic, INTENT_ASSETS } from "../../lib/intents/capability-templates";
import { useWallet } from "../wallet/WalletProvider";
import { IntentGoalInput } from "./IntentGoalInput";
import { PolicyReceiptEditor, type ReceiptValues } from "./PolicyReceiptEditor";

const initialValues: ReceiptValues = {
  templateId: "aave-supply",
  inputToken: INTENT_ASSETS[0].address,
  outputToken: INTENT_ASSETS[1].address,
  amount: "10",
  minimum: "9.95",
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The intent could not be published.";
}

export function IntentComposer() {
  const wallet = useWallet();
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inputAsset = INTENT_ASSETS.find(({ address }) => address === values.inputToken) ?? INTENT_ASSETS[0];
  const outputAsset = INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? INTENT_ASSETS[1];
  const inputAtomic = useMemo(() => decimalToAtomic(values.amount, inputAsset.decimals), [inputAsset.decimals, values.amount]);
  const minimumAtomic = useMemo(() => decimalToAtomic(values.minimum, outputAsset.decimals), [outputAsset.decimals, values.minimum]);
  const valid = Boolean(wallet.account && goal.trim() && inputAtomic && (values.templateId === "aave-supply" || minimumAtomic));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !wallet.account || !inputAtomic) return;
    setPending(true);
    setError(undefined);
    try {
      await wallet.switchToXLayer();
      const requestId = crypto.randomUUID();
      const nowSec = Math.floor(Date.now() / 1_000);
      const nonce = keccak256(stringToHex(`${requestId}:${wallet.account}:${nowSec}:${crypto.randomUUID()}`));
      const common = {
        requestId,
        owner: wallet.account,
        inputToken: values.inputToken,
        inputAtomic,
        nonce,
        nowSec,
        displayGoal: goal.trim(),
        competitionDurationSec: 300,
      } as const;
      const policy = values.templateId === "aave-supply"
        ? buildGeneralIntentPolicyV2({ ...common, templateId: "aave-supply", exposureBps: 10_000 })
        : values.templateId === "exact-input-swap" && minimumAtomic
          ? buildGeneralIntentPolicyV2({ ...common, templateId: "exact-input-swap", outputToken: values.outputToken, minimumOutputAtomic: minimumAtomic })
          : values.templateId === "round-trip" && minimumAtomic
            ? buildGeneralIntentPolicyV2({ ...common, templateId: "round-trip", minimumProfitAtomic: minimumAtomic })
            : (() => { throw new Error("Complete the minimum result before signing."); })();
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [commitment(policy), policy.owner],
      });
      if (typeof ownerSignature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(ownerSignature)) {
        throw new Error("The wallet returned an invalid intent signature.");
      }
      const response = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ownerSignature }),
      });
      const payload = await response.json() as { links?: { intent?: string }; message?: string };
      if (!response.ok || !payload.links?.intent) {
        throw new Error(payload.message ?? "The intent could not be published.");
      }
      router.push(payload.links.intent);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="intent-composer" noValidate onSubmit={submit}>
      <IntentGoalInput value={goal} onChange={setGoal} />
      <PolicyReceiptEditor owner={wallet.account} values={values} onChange={setValues} />
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      <button className="button button--primary intent-submit" disabled={!valid || pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : null}
        {pending ? "Publishing intent…" : "Review and sign intent"}
        {!pending ? <ArrowRight aria-hidden="true" size={17} /> : null}
      </button>
      {!wallet.account ? <p className="intent-connect-note">Connect your wallet in the header to bind the policy owner.</p> : null}
    </form>
  );
}
