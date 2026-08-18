export const INTENT_EXAMPLES = [
  { goal: "Put 10 USDG into a bounded Aave position.", status: "Live capability", enabled: true },
  { goal: "Shop with an x402 payment under 50 USDt0.", status: "Requires capability", enabled: false },
  { goal: "Manage a subscription with a monthly spending cap.", status: "Requires capability", enabled: false },
] as const;
