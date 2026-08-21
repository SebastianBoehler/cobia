import { ArrowUp, AtSign, LoaderCircle, Route } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  ACTION_PREFERENCES, PROTOCOL_EXCLUSIONS, type ActionPreference, type ProtocolExclusionId,
} from "../../lib/intents/intent-controls";

const EXAMPLE_INTENTS = [
  "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer",
  "Supply 10 @USDG to @Aave on @XLayer",
  "Acquire at least 0.01 @PAXG on @Ethereum",
] as const;

function renderTaggedPrompt(prompt: string) {
  return prompt.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@")
    ? <strong key={`${part}-${index}`}>{part}</strong>
    : part);
}

function renderRecognizedPrompt(prompt: string, mentions: readonly IntentMention[]) {
  const recognized = new Set(mentions.map(({ mention }) => mention.toLocaleLowerCase()));
  return prompt.split(/(@[A-Za-z0-9][A-Za-z0-9/-]*)/g).map((part, index) => {
    const mention = part.startsWith("@") ? part.slice(1).toLocaleLowerCase() : "";
    return recognized.has(mention) ? <strong key={`${part}-${index}`}>{part}</strong> : part;
  });
}

export interface IntentMention {
  id: string;
  group: "Assets" | "Networks" | "Protocols" | "Services";
  mention: string;
  detail: string;
}

export function IntentGoalInput({ value, compiling, submitEnabled, action, excludedProtocols, mentions,
  selectedMentions, onChange, onActionChange, onMention, onMentionMenuOpen,
  onExcludedProtocolsChange, onSubmit }: {
  value: string;
  compiling: boolean;
  submitEnabled: boolean;
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
  const controlsRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      for (const details of controlsRef.current?.querySelectorAll("details[open]") ?? []) {
        if (!details.contains(event.target as Node)) details.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  return (
    <section className="intent-goal">
      <label className="sr-only" htmlFor="intent-goal">What should happen?</label>
      <div className="intent-goal__input">
        <div aria-hidden="true" className="intent-goal__highlight"
          data-testid="intent-goal-highlight" ref={highlightRef}>
          {renderRecognizedPrompt(value, mentions)}
        </div>
        <textarea
          id="intent-goal"
          maxLength={500}
          placeholder="Ask Cobia to do something onchain…"
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
              highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && value.trim().length >= 3) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
      {!value.trim() ? <div aria-label="Example intents" className="intent-examples">
        {EXAMPLE_INTENTS.map((example) => <button aria-label={`Use example: ${example}`}
          key={example} onClick={() => onChange(example)} type="button">
          {renderTaggedPrompt(example)}
        </button>)}
      </div> : null}
      <div className="intent-goal__tools">
        <div className="intent-goal__controls" ref={controlsRef}>
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
                    onClick={(event) => {
                      onMention(mention);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }} type="button">
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
          disabled={value.trim().length < 3 || compiling || !submitEnabled} onClick={onSubmit} type="button">
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
