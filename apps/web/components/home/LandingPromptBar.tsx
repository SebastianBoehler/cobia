"use client";

import { ArrowUp } from "lucide-react";
import { useState } from "react";

const TAGS = ["@USDG", "@USDt0", "@Aave", "@XLayer"] as const;

export function LandingPromptBar() {
  const [goal, setGoal] = useState("");

  function append(tag: string) {
    setGoal((current) => current.includes(tag) ? current
      : `${current}${current && !current.endsWith(" ") ? " " : ""}${tag} `);
  }

  return (
    <form action="/intents/new" className="landing-prompt" method="get">
      <label className="sr-only" htmlFor="landing-goal">Describe an onchain goal</label>
      <div className="landing-prompt__field">
        <input id="landing-goal" maxLength={500} name="goal"
          placeholder="Ask Cobia to do something onchain…" value={goal}
          onChange={(event) => setGoal(event.target.value)} />
        <button aria-label="Start intent" type="submit">
          <ArrowUp aria-hidden="true" size={20} strokeWidth={2} />
        </button>
      </div>
      <div aria-label="Prompt tags" className="landing-prompt__tags">
        {TAGS.map((tag) => <button key={tag} onClick={() => append(tag)} type="button">{tag}</button>)}
      </div>
    </form>
  );
}
