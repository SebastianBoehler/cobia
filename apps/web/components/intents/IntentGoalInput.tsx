import { INTENT_EXAMPLES } from "../../lib/intents/domain-examples";

export function IntentGoalInput({ value, onChange }: { value: string; onChange(value: string): void }) {
  return (
    <section className="intent-goal">
      <label htmlFor="intent-goal">What should happen?</label>
      <textarea
        id="intent-goal"
        maxLength={500}
        placeholder="Describe the outcome you want, in your own words."
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="intent-examples" aria-label="Intent examples">
        {INTENT_EXAMPLES.map((example) => (
          <button
            disabled={!example.enabled}
            key={example.goal}
            onClick={() => onChange(example.goal)}
            type="button"
          >
            <span className="intent-example__goal">{example.goal}</span>
            <span className={`intent-example__status ${example.enabled ? "intent-example__status--live" : ""}`}>
              {example.status}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
