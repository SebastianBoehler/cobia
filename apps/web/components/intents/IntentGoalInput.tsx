import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ActionPreference, type ProtocolExclusionId } from "../../lib/intents/intent-controls";
import type { AvailableIntentAsset } from "./IntentAvailableAssets";
import { IntentGoalControls } from "./IntentGoalControls";
import { IntentOptionMark } from "./IntentOptionMark";
import { V3_INTENT_EXAMPLES } from "../../lib/intents/public-examples";
import { tagKnownAssetSymbols } from "../../lib/intents/intent-asset-references";
import type { AssetResolutionStatus } from "./useResolvedAssetMentions";
import type { IntentPolicySettingsValue } from "./IntentPolicySettings";

function extractMentionQuery(value: string): string | undefined {
  return value.match(/(?:^|\s)@([A-Za-z0-9.$_-]*)$/)?.[1];
}

function renderTaggedPrompt(prompt: string) {
  return prompt.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@")
    ? <strong key={`${part}-${index}`}>{part}</strong>
    : part);
}

function renderRecognizedPrompt(prompt: string, unresolvedMentions: readonly string[]) {
  const unresolved = new Set(unresolvedMentions.map((mention) => mention.toLowerCase()));
  return prompt.split(/(@[A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*)/g).map((part, index) =>
    part.startsWith("@") ? <strong className={unresolved.has(part.slice(1).toLowerCase())
      ? "intent-mention--unresolved" : undefined} key={`${part}-${index}`}>{part}</strong> : part);
}

function usdPrice(value: string): string {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return `$${value}`;
  const maximumFractionDigits = price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits })}`;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export interface IntentMention {
  id: string;
  group: "Assets" | "Networks" | "Protocols" | "Services";
  mention: string;
  detail: string;
  chainId?: 1 | 196;
  address?: string;
  decimals?: number;
  priceUsd?: string;
  walletBalance?: string;
}

export function IntentGoalInput({ value, compiling, submitEnabled, action, excludedProtocols, mentions,
  unresolvedMentions, assetResolutionStatus, assetSymbols, availableAssets, portfolioState,
  policySettings,
  examples = V3_INTENT_EXAMPLES,
  onChange, onActionChange, onMention, onMentionMenuOpen,
  onMentionSuggestion, onExcludedProtocolsChange, onPolicySettingsChange, onSubmit }: {
  value: string;
  compiling: boolean;
  submitEnabled: boolean;
  action: ActionPreference;
  excludedProtocols: readonly ProtocolExclusionId[];
  mentions: readonly IntentMention[];
  unresolvedMentions: readonly string[];
  assetResolutionStatus: AssetResolutionStatus;
  assetSymbols: readonly string[];
  availableAssets: readonly AvailableIntentAsset[];
  portfolioState: "idle" | "loading" | "ready" | "error";
  policySettings: IntentPolicySettingsValue;
  examples?: readonly string[];
  onChange(value: string): void;
  onActionChange(value: ActionPreference): void;
  onMention(value: IntentMention): void;
  onMentionSuggestion(value: IntentMention): void;
  onMentionMenuOpen(): void;
  onExcludedProtocolsChange(value: ProtocolExclusionId[]): void;
  onPolicySettingsChange(value: IntentPolicySettingsValue): void;
  onSubmit(): void;
}) {
  const inputRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const typeaheadOpenedRef = useRef(false);
  const typeaheadId = useId();
  const [typeaheadPosition, setTypeaheadPosition] = useState({ left: 8, top: 8, width: 360 });
  const [typeaheadState, setTypeaheadState] = useState<{
    query: string | undefined;
    activeIndex: number;
    dismissed: boolean;
  }>({ query: undefined, activeIndex: 0, dismissed: false });
  const mentionQuery = extractMentionQuery(value);
  const mentionSuggestions = useMemo(() => mentionQuery === undefined ? [] : mentions
    .filter(({ mention }) => mention.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    .slice(0, 6), [mentionQuery, mentions]);
  const currentTypeaheadState = typeaheadState.query === mentionQuery
    ? typeaheadState : { query: mentionQuery, activeIndex: 0, dismissed: false };
  const activeMentionIndex = mentionSuggestions.length
    ? Math.min(currentTypeaheadState.activeIndex, mentionSuggestions.length - 1) : 0;
  const typeaheadVisible = mentionSuggestions.length > 0 && !currentTypeaheadState.dismissed;

  const positionTypeahead = useCallback(() => {
    const input = inputRef.current;
    const textarea = textareaRef.current;
    const caret = caretRef.current;
    if (!input || !textarea || !caret) return;

    const width = Math.min(360, Math.max(0, input.clientWidth - 16));
    const maximumLeft = Math.max(8, input.clientWidth - width - 8);
    setTypeaheadPosition({
      left: Math.min(Math.max(8, caret.offsetLeft - textarea.scrollLeft), maximumLeft),
      top: Math.max(8, caret.offsetTop - textarea.scrollTop + caret.offsetHeight + 4),
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (mentionSuggestions.length) positionTypeahead();
  }, [mentionSuggestions.length, positionTypeahead, value]);

  useEffect(() => {
    if (!mentionSuggestions.length) return;
    window.addEventListener("resize", positionTypeahead);
    return () => window.removeEventListener("resize", positionTypeahead);
  }, [mentionSuggestions.length, positionTypeahead]);

  useEffect(() => {
    if (mentionQuery === undefined) {
      typeaheadOpenedRef.current = false;
    } else if (!typeaheadOpenedRef.current) {
      typeaheadOpenedRef.current = true;
      onMentionMenuOpen();
    }
  }, [mentionQuery, onMentionMenuOpen]);

  function acceptMentionSuggestion(mention: IntentMention) {
    onMentionSuggestion(mention);
    textareaRef.current?.focus();
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  function moveActiveMention(direction: 1 | -1) {
    setTypeaheadState({
      query: mentionQuery,
      activeIndex: (activeMentionIndex + direction + mentionSuggestions.length)
        % mentionSuggestions.length,
      dismissed: false,
    });
  }

  function addAvailableAsset(asset: AvailableIntentAsset) {
    onMention({ id: `available-asset:${asset.symbol}`, group: "Assets", mention: asset.symbol,
      detail: `${asset.amount} ${asset.symbol} available` });
    textareaRef.current?.focus();
  }

  return (
    <section aria-labelledby="intent-goal-heading" className="intent-goal">
      <header className="intent-goal__header">
        <h2 id="intent-goal-heading">Write one clear outcome</h2>
        <p>Include what you will spend, what you expect back, and any limits that matter.</p>
      </header>
      <label className="sr-only" htmlFor="intent-goal">What should happen?</label>
      <div className="intent-goal__input" ref={inputRef}>
        <div aria-hidden="true" className="intent-goal__highlight"
          data-testid="intent-goal-highlight" ref={highlightRef}>
          {renderRecognizedPrompt(value, unresolvedMentions)}
        </div>
        <div aria-hidden="true" className="intent-caret-mirror">
          {value}<span className="intent-caret-anchor" ref={caretRef}>&#8203;</span>
        </div>
        <textarea
          aria-activedescendant={typeaheadVisible
            ? `${typeaheadId}-option-${activeMentionIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={typeaheadVisible ? typeaheadId : undefined}
          aria-expanded={typeaheadVisible}
          aria-haspopup="listbox"
          id="intent-goal"
          maxLength={500}
          placeholder="For example: Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer"
          role="combobox"
          rows={3}
          value={value}
          ref={textareaRef}
          onFocus={onMentionMenuOpen}
          onChange={(event) => {
            const nextValue = event.target.value;
            setTypeaheadState({
              query: extractMentionQuery(nextValue), activeIndex: 0, dismissed: false,
            });
            onChange(nextValue);
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = tagKnownAssetSymbols(event.clipboardData.getData("text/plain"), assetSymbols);
            const start = event.currentTarget.selectionStart;
            const end = event.currentTarget.selectionEnd;
            const nextValue = `${value.slice(0, start)}${pasted}${value.slice(end)}`;
            onChange(nextValue);
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(
              start + pasted.length, start + pasted.length,
            ));
          }}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
              highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            }
            positionTypeahead();
          }}
          onKeyDown={(event) => {
            if (typeaheadVisible && event.key === "ArrowDown") {
              event.preventDefault();
              moveActiveMention(1);
              return;
            }
            if (typeaheadVisible && event.key === "ArrowUp") {
              event.preventDefault();
              moveActiveMention(-1);
              return;
            }
            if (typeaheadVisible && event.key === "Escape") {
              event.preventDefault();
              setTypeaheadState({ query: mentionQuery, activeIndex: activeMentionIndex, dismissed: true });
              return;
            }
            const acceptsWithEnter = event.key === "Enter"
              && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
            if (typeaheadVisible && ((event.key === "Tab" && !event.shiftKey) || acceptsWithEnter)) {
              event.preventDefault();
              acceptMentionSuggestion(mentionSuggestions[activeMentionIndex]);
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && value.trim().length >= 3) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        {typeaheadVisible ? <div aria-label="Mention suggestions" className="intent-typeahead"
          id={typeaheadId} role="listbox" style={typeaheadPosition}>
          {mentionSuggestions.map((mention, index) => <button
            aria-selected={index === activeMentionIndex}
            id={`${typeaheadId}-option-${index}`} key={mention.id}
            onClick={() => acceptMentionSuggestion(mention)}
            onMouseEnter={() => setTypeaheadState({
              query: mentionQuery, activeIndex: index, dismissed: false,
            })}
            role="option" tabIndex={-1} type="button">
            <span aria-hidden="true" className="intent-typeahead__mark">
              <IntentOptionMark group={mention.group} mention={mention.mention} />
            </span>
            <strong>@{mention.mention}</strong>
            {mention.address ? <code title={mention.address}>{shortAddress(mention.address)}</code>
              : <small>{mention.detail}</small>}
            {mention.address ? <span className="intent-typeahead__evidence">
              <b>{mention.priceUsd ? usdPrice(mention.priceUsd) : "Price unavailable"}</b>
              {mention.walletBalance ? <small>Balance {mention.walletBalance}</small> : null}
            </span> : null}
          </button>)}
        </div> : null}
      </div>
      {assetResolutionStatus === "checking" ? <p className="intent-token-status" role="status">
        Checking token identity…
      </p> : assetResolutionStatus === "error" ? <p className="intent-token-status intent-token-status--error" role="alert">
        Token identity could not be verified. Try again before review.
      </p> : unresolvedMentions.length ? <p className="intent-token-status intent-token-status--error" role="alert">
        {unresolvedMentions.length === 1
          ? `Choose a supported token for @${unresolvedMentions[0]} before review.`
          : `Choose supported tokens for ${unresolvedMentions.map((mention) => `@${mention}`).join(", ")} before review.`}
      </p> : null}
      {!value.trim() ? <div aria-label="Example intents" className="intent-examples">
        <p>Or start with an example</p>
        {examples.map((example) => <button aria-label={`Use example: ${example}`}
          key={example} onClick={() => onChange(example)} type="button">
          {renderTaggedPrompt(example)}
        </button>)}
      </div> : null}
      <IntentGoalControls action={action} availableAssets={availableAssets} compiling={compiling}
        excludedProtocols={excludedProtocols} mentions={mentions} policySettings={policySettings}
        portfolioState={portfolioState} submitEnabled={submitEnabled} value={value}
        onActionChange={onActionChange} onAvailableAsset={addAvailableAsset}
        onExcludedProtocolsChange={onExcludedProtocolsChange} onMention={onMention}
        onMentionMenuOpen={onMentionMenuOpen} onPolicySettingsChange={onPolicySettingsChange}
        onSubmit={onSubmit} />
    </section>
  );
}
