import { Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface IntentPolicySettingsValue {
  maxSlippageBps: number;
  marketMarginBps: number;
}

function percent(bps: number): string {
  return (bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function IntentPolicySettings({ value, onChange }: {
  value: IntentPolicySettingsValue;
  onChange(value: IntentPolicySettingsValue): void;
}) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const marginHintId = useId();

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !open) return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function setPercent(field: keyof IntentPolicySettingsValue, raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next > 10) return;
    onChange({ ...value, [field]: Math.round(next * 100) });
  }

  return <div className="intent-route-control intent-settings" ref={controlRef}>
    <button aria-controls={panelId} aria-expanded={open}
      aria-label={`Settings: ${percent(value.maxSlippageBps)}% maximum slippage, ` +
        `${percent(value.marketMarginBps)}% output protection margin`}
      className="intent-settings__trigger" onClick={() => setOpen((current) => !current)}
      ref={triggerRef} type="button">
      <Settings2 aria-hidden="true" size={16} /> Settings
      <span className="intent-settings__tag">
        {percent(value.maxSlippageBps)}% / {percent(value.marketMarginBps)}%
      </span>
    </button>
    {open ? <div aria-label="Execution protection" className="intent-route-control__menu intent-settings__menu"
      id={panelId} role="group">
      <strong>Execution protection</strong>
      <p>These defaults become exact policy bounds. Review them before signing.</p>
      <label><span>Maximum slippage</span><span className="intent-settings__number">
        <input aria-label="Maximum slippage (%)" max="10" min="0" step="0.1" type="number"
          value={percent(value.maxSlippageBps)}
          onChange={(event) => setPercent("maxSlippageBps", event.target.value)} />
        <b>%</b>
      </span></label>
      <label><span>Output protection margin</span><span className="intent-settings__number">
        <input aria-describedby={marginHintId} aria-label="Output protection margin (%)"
          max="10" min="0" step="0.1" type="number"
          value={percent(value.marketMarginBps)}
          onChange={(event) => setPercent("marketMarginBps", event.target.value)} />
        <b>%</b>
      </span><small id={marginHintId}>Applied when Cobia derives an output minimum from fresh market data.</small></label>
    </div> : null}
  </div>;
}
