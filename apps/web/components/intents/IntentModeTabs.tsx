import { ArrowLeftRight, Target, TrendingUp } from "lucide-react";

export type IntentMode = "Earn" | "Swap" | "Profit";

const modes = [
  { icon: TrendingUp, label: "Earn" },
  { icon: ArrowLeftRight, label: "Swap" },
  { icon: Target, label: "Profit" },
] as const;

export function IntentModeTabs({
  mode,
  onChange,
}: {
  mode: IntentMode;
  onChange(mode: IntentMode): void;
}) {
  return (
    <div aria-label="Intent mode" className="intent-modes" role="tablist">
      {modes.map(({ icon: Icon, label }) => (
        <button
          aria-selected={mode === label}
          className={mode === label ? "is-active" : undefined}
          key={label}
          onClick={() => onChange(label)}
          role="tab"
          type="button"
        >
          <Icon aria-hidden="true" size={17} />
          {label}
        </button>
      ))}
    </div>
  );
}
