export const INTENT_EXAMPLES = [
  { goal: "Put 10 USDG into a bounded Aave position.", status: "Supported", enabled: true },
  { goal: "Shop with an x402 payment under 50 USDt0.", status: "Use Discover offers", enabled: false },
  { goal: "Manage a subscription with a monthly spending cap.", status: "Additional semantics needed", enabled: false },
] as const;
