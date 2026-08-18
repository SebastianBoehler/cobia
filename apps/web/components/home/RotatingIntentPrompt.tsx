"use client";

import { useEffect, useState } from "react";

const prompts = [
  { text: "Move 10 USDG into the best verified position while keeping at least 10.04 USDt0.", status: "Live capability", live: true },
  { text: "Buy a train ticket for tomorrow using no more than 50 USDt0.", status: "Requires capability", live: false },
  { text: "Pay this subscription monthly, but stop before total spend exceeds 120 USDt0.", status: "Requires capability", live: false },
  { text: "Acquire a tokenized Treasury position only from an approved issuer.", status: "Requires capability", live: false },
] as const;

export function RotatingIntentPrompt() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % prompts.length), 4_500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const prompt = prompts[active];
  return (
    <div
      className="rotating-prompt"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="rotating-prompt__label"><span>Describe your goal</span><strong className={prompt.live ? "is-live" : ""}>{prompt.status}</strong></div>
      <p key={prompt.text}>{prompt.text}</p>
      <div className="rotating-prompt__controls" aria-label="Example intent">
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
    </div>
  );
}
