import { ArrowRight, AtSign, LoaderCircle, Route } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  ACTION_PREFERENCES, PROTOCOL_EXCLUSIONS, type ActionPreference, type ProtocolExclusionId,
} from "../../lib/intents/intent-controls";
import { IntentAvailableAssets, type AvailableIntentAsset } from "./IntentAvailableAssets";
import type { IntentMention } from "./IntentGoalInput";
import { IntentOptionMark } from "./IntentOptionMark";
import { IntentPolicySettings, type IntentPolicySettingsValue } from "./IntentPolicySettings";

export function IntentGoalControls({ action, availableAssets, compiling, excludedProtocols, mentions,
  policySettings, portfolioState, submitEnabled, value, onActionChange,
  onAvailableAsset, onExcludedProtocolsChange, onMention, onMentionMenuOpen,
  onPolicySettingsChange, onSubmit }: {
  action: ActionPreference;
  availableAssets: readonly AvailableIntentAsset[];
  compiling: boolean;
  excludedProtocols: readonly ProtocolExclusionId[];
  mentions: readonly IntentMention[];
  policySettings: IntentPolicySettingsValue;
  portfolioState: "idle" | "loading" | "ready" | "error";
  submitEnabled: boolean;
  value: string;
  onActionChange(value: ActionPreference): void;
  onAvailableAsset(asset: AvailableIntentAsset): void;
  onExcludedProtocolsChange(value: ProtocolExclusionId[]): void;
  onMention(value: IntentMention): void;
  onMentionMenuOpen(): void;
  onPolicySettingsChange(value: IntentPolicySettingsValue): void;
  onSubmit(): void;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      for (const details of controlsRef.current?.querySelectorAll("details[open]") ?? []) {
        if (!details.contains(event.target as Node)) details.removeAttribute("open");
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      for (const details of controlsRef.current?.querySelectorAll("details[open]") ?? []) {
        const restoreFocus = details.contains(document.activeElement);
        details.removeAttribute("open");
        if (restoreFocus) details.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <footer className="intent-goal__footer">
    <div className="intent-goal__controls" ref={controlsRef}>
      <label className="intent-action-field"><span>Intent type</span>
        <select aria-label="Action type" value={action}
          onChange={(event) => onActionChange(event.target.value as ActionPreference)}>
          {ACTION_PREFERENCES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <details className="intent-route-control" onToggle={(event) => {
        if (event.currentTarget.open) onMentionMenuOpen();
      }}>
        <summary><AtSign aria-hidden="true" size={16} />Mention</summary>
        <div className="intent-route-control__menu intent-mention-menu">
          {["Assets", "Networks", "Protocols", "Services"].map((group) => {
            const options = mentions.filter((mention) => mention.group === group);
            return options.length ? <section key={group}><strong>{group}</strong>
              {options.map((mention) => <button key={mention.id}
                onClick={(event) => {
                  onMention(mention);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }} type="button">
                <span aria-hidden="true" className="intent-option-mark">
                  <IntentOptionMark group={mention.group} mention={mention.mention} />
                </span>
                <span className="intent-mention-menu__label">@{mention.mention}</span>
                <small>{mention.detail}</small>
              </button>)}</section> : null;
          })}
        </div>
      </details>
      <details className="intent-route-control">
        <summary><Route aria-hidden="true" size={16} />Route limits
          {excludedProtocols.length ? <span>{excludedProtocols.length}</span> : null}</summary>
        <div className="intent-route-control__menu">
          <strong>Exclude protocols</strong>
          <p>Excluded contract targets are written into the signed policy.</p>
          {PROTOCOL_EXCLUSIONS.map((protocol) => <label key={protocol.id}>
            <input checked={excludedProtocols.includes(protocol.id)} type="checkbox"
              onChange={(event) => onExcludedProtocolsChange(event.target.checked
                ? [...excludedProtocols, protocol.id]
                : excludedProtocols.filter((id) => id !== protocol.id))} />
            <span aria-hidden="true" className="intent-option-mark">
              <IntentOptionMark group="Protocols" mention={protocol.label} />
            </span>
            <span>{protocol.label}</span>
          </label>)}
        </div>
      </details>
      <IntentPolicySettings value={policySettings} onChange={onPolicySettingsChange} />
    </div>
    <div className="intent-goal__review">
      <IntentAvailableAssets assets={availableAssets} onSelect={onAvailableAsset} state={portfolioState} />
      <div className="intent-goal__review-action">
        <span>Nothing is signed yet.</span>
        <button className="button button--primary intent-goal__send"
          disabled={value.trim().length < 3 || compiling || !submitEnabled}
          onClick={onSubmit} type="button">
          {compiling ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : null}
          {compiling ? "Building policy…" : "Review policy"}
          {!compiling ? <ArrowRight aria-hidden="true" size={18} /> : null}
        </button>
      </div>
    </div>
  </footer>;
}
