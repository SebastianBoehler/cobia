"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const prompts = [
  { text: "Move 10 USDG into the best verified position while keeping at least 10.04 USDt0.", status: "Supported", live: true },
  { text: "Buy a listed resource with an x402 payment capped at 50 USDt0.", status: "Supported when listed", live: true },
  { text: "Use another protocol only if its exact calls reproduce and satisfy my balance floor.", status: "Open solver lane", live: true },
  { text: "Pay this subscription monthly, but stop before total spend exceeds 120 USDt0.", status: "Additional semantics needed", live: false },
] as const;

export function RotatingIntentPrompt() {
  const [active, setActive] = useState(0);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const paused = interactionPaused || manuallyPaused;

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % prompts.length), 4_500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const prompt = prompts[active];
  return (
    <div
      className="rotating-prompt"
      onBlur={() => setInteractionPaused(false)}
      onFocus={() => setInteractionPaused(true)}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
    >
      <div className="rotating-prompt__content" key={prompt.text}>
        <div className="rotating-prompt__label"><span>Describe your goal</span><strong className={prompt.live ? "is-live" : ""}>{prompt.status}</strong></div>
        <p>{prompt.text}</p>
      </div>
      <div className="rotating-prompt__controls" aria-label="Example intents" role="group">
        <div className="rotating-prompt__pages">
          {prompts.map((item, index) => (
            <button
              aria-label={`Show example ${index + 1}`}
              aria-pressed={active === index}
              key={item.text}
              onClick={() => setActive(index)}
              type="button"
            />
          ))}
        </div>
        <button
          aria-label={manuallyPaused ? "Play examples" : "Pause examples"}
          className="rotating-prompt__pause"
          onClick={() => setManuallyPaused((value) => !value)}
          type="button"
        >
          {manuallyPaused ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
        </button>
      </div>
    </div>
  );
}
