"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const prompts = [
  "Move 10 @USDG into the best verified position while keeping at least 10.04 @USDt0 on @XLayer.",
  "Buy a fresh crypto market brief with an x402 payment capped at 0.01 @USDC.",
  "Use @Uniswap only if its exact calls reproduce and satisfy my balance floor.",
  "Pay this subscription monthly on @XLayer, but stop before total spend exceeds 120 @USDt0.",
] as const;

function tagged(prompt: string) {
  return prompt.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@")
    ? <strong key={`${part}-${index}`}>{part}</strong> : part);
}

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
      <div className="rotating-prompt__content" key={prompt}>
        <div className="rotating-prompt__label"><span>Describe your goal</span></div>
        <p>{tagged(prompt)}</p>
      </div>
      <div className="rotating-prompt__controls" aria-label="Example intents" role="group">
        <div className="rotating-prompt__pages">
          {prompts.map((item, index) => (
            <button
              aria-label={`Show example ${index + 1}`}
              aria-pressed={active === index}
              key={item}
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
