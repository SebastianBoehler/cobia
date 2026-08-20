import { ArrowUp, AtSign, LoaderCircle, Route } from "lucide-react";
import {
  ACTION_PREFERENCES, PROTOCOL_EXCLUSIONS, type ActionPreference, type ProtocolExclusionId,
} from "../../lib/intents/intent-controls";

export interface IntentMention {
  id: string;
  group: "Assets" | "Networks" | "Protocols" | "Services";
  mention: string;
  detail: string;
}

export function IntentGoalInput({ value, compiling, action, excludedProtocols, mentions,
  selectedMentions, onChange, onActionChange, onMention, onMentionMenuOpen,
  onExcludedProtocolsChange, onSubmit }: {
  value: string;
  compiling: boolean;
  action: ActionPreference;
  excludedProtocols: readonly ProtocolExclusionId[];
  mentions: readonly IntentMention[];
  selectedMentions: readonly IntentMention[];
  onChange(value: string): void;
  onActionChange(value: ActionPreference): void;
  onMention(value: IntentMention): void;
  onMentionMenuOpen(): void;
  onExcludedProtocolsChange(value: ProtocolExclusionId[]): void;
  onSubmit(): void;
}) {
  return (
    <section className="intent-goal">
      <label className="sr-only" htmlFor="intent-goal">What should happen?</label>
      <textarea
        id="intent-goal"
        maxLength={500}
        placeholder="Ask Cobia to do something onchain…"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && value.trim().length >= 3) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="intent-goal__tools">
        <div className="intent-goal__controls">
          <select aria-label="Action type" value={action}
            onChange={(event) => onActionChange(event.target.value as ActionPreference)}>
            {ACTION_PREFERENCES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <details className="intent-route-control" onToggle={(event) => {
            if (event.currentTarget.open) onMentionMenuOpen();
          }}>
            <summary><AtSign aria-hidden="true" size={16} />Mention</summary>
            <div className="intent-route-control__menu intent-mention-menu">
              {["Assets", "Networks", "Protocols", "Services"].map((group) => {
                const options = mentions.filter((mention) => mention.group === group);
                return options.length ? <section key={group}><strong>{group}</strong>
                  {options.map((mention) => <button key={mention.id}
                    onClick={() => onMention(mention)} type="button">
                    <span>@{mention.mention}</span><small>{mention.detail}</small>
                  </button>)}</section> : null;
              })}
            </div>
          </details>
          <details className="intent-route-control">
            <summary><Route aria-hidden="true" size={16} />Routes
              {excludedProtocols.length ? <span>{excludedProtocols.length}</span> : null}</summary>
            <div className="intent-route-control__menu">
              <strong>Exclude protocols</strong>
              <p>Excluded contract targets are written into the signed policy.</p>
              {PROTOCOL_EXCLUSIONS.map((protocol) => <label key={protocol.id}>
                <input checked={excludedProtocols.includes(protocol.id)} type="checkbox"
                  onChange={(event) => onExcludedProtocolsChange(event.target.checked
                    ? [...excludedProtocols, protocol.id]
                    : excludedProtocols.filter((id) => id !== protocol.id))} />
                {protocol.label}
              </label>)}
            </div>
          </details>
        </div>
        <button aria-label="Review policy" className="intent-goal__send"
          disabled={value.trim().length < 3 || compiling} onClick={onSubmit} type="button">
          {compiling ? <LoaderCircle aria-hidden="true" className="spin" size={19} />
            : <ArrowUp aria-hidden="true" size={20} />}
        </button>
      </div>
      {selectedMentions.length ? <div className="intent-selected-mentions" aria-label="Attached entities">
        {selectedMentions.map((mention) => <span key={mention.id}>
          <strong>@{mention.mention}</strong><small>{mention.detail}</small>
        </span>)}
      </div> : null}
    </section>
  );
}
