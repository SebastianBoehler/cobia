"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { GeneralAssetLaunchState } from "../../lib/network/general-asset-launch-status";
import { publicIntentExamples } from "../../lib/intents/public-examples";
import { useGeneralAssetLaunchState } from "../network/useGeneralAssetLaunchState";

function tagged(prompt: string) {
  return prompt.split(/(@[A-Za-z0-9]+)/g).map((part, index) => part.startsWith("@")
    ? <strong key={`${part}-${index}`}>{part}</strong> : part);
}

export function RotatingIntentPrompt({ launchState }: { launchState?: GeneralAssetLaunchState }) {
  const observedLaunchState = useGeneralAssetLaunchState();
  const prompts = publicIntentExamples(launchState ?? observedLaunchState);
  const [active, setActive] = useState(0);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const paused = interactionPaused || manuallyPaused;

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % prompts.length), 4_500);
    return () => window.clearInterval(timer);
  }, [paused, prompts.length]);

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
