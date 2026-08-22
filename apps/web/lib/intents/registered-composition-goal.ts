import { INTENT_ASSETS } from "./capability-templates";
import {
  resolveCompositionDraft,
  type CompositionModelDraft,
  type ComposedIntentDraft,
} from "./composition-draft";

const MINUTE_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30,
};

function explicitInput(goal: string) {
  for (const asset of INTENT_ASSETS) {
    const pattern = new RegExp(
      `\\buse(?:\\s+(?:at\\s+most|up\\s+to))?\\s+(\\d+(?:\\.\\d+)?)\\s+${asset.symbol}\\b`,
      "i",
    );
    const amount = goal.match(pattern)?.[1];
    if (amount) return { inputSymbol: asset.symbol, amount };
  }
  return undefined;
}

function explicitLossBps(goal: string): number | undefined {
  const value = goal.match(
    /\b(?:allow\s+)?(?:no\s+more\s+than|at\s+most|maximum|max)\s+(\d+(?:\.\d{1,2})?)\s*%\s+(?:conversion\s+)?loss\b/i,
  )?.[1];
  if (!value) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isInteger(bps) && bps <= 500 ? bps : undefined;
}

function explicitDeadlineMinutes(goal: string): number | undefined {
  const value = goal.match(
    /\b(?:expire|expires|deadline)(?:\s+in)?\s+(\d+|[a-z]+)\s+minutes?\b/i,
  )?.[1]?.toLowerCase();
  if (!value) return undefined;
  const minutes = /^\d+$/.test(value) ? Number(value) : MINUTE_WORDS[value];
  return minutes && minutes <= 30 ? minutes : undefined;
}

export function resolveRegisteredCompositionGoal(goal: string): ComposedIntentDraft | undefined {
  const input = explicitInput(goal);
  const maxConversionLossBps = explicitLossBps(goal);
  const deadlineMinutes = explicitDeadlineMinutes(goal);
  const capabilityIds: CompositionModelDraft["capabilityIds"] = [];
  if (/\baave(?:\s+v3)?\b/i.test(goal)) capabilityIds.push("aave-v3.supply");
  if (/\bcurve\b/i.test(goal)) capabilityIds.push("curve-stableswap-ng.exact-input");
  if (/\buniswap(?:\s+v3)?\b/i.test(goal)) capabilityIds.push("uniswap-v3.exact-input");

  const complete = /\bx\s*layer\b/i.test(goal) &&
    /\b(?:stablecoin[-\s]?yield|yield\s+(?:route|position))\b/i.test(goal) &&
    /\bminimum\s+receipt[-\s]?token\s+balance\b/i.test(goal) &&
    capabilityIds.includes("aave-v3.supply") && capabilityIds.length >= 2 &&
    input && maxConversionLossBps !== undefined && deadlineMinutes;
  if (!complete) return undefined;

  return resolveCompositionDraft({
    ...input,
    capabilityIds,
    maxConversionLossBps,
    deadlineMinutes,
  });
}
