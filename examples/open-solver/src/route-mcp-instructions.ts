export const ROUTE_MCP_INSTRUCTIONS = {
  version: 1 as const,
  shellAvailable: false as const,
  workflow: [
    "Read the immutable intent and capability declaration.",
    "Try solve for a fast canonical candidate.",
    "If solve abstains, allocate signed input budgets across signed output floors.",
    "Call plan with positive atomic input amounts; one input may appear in multiple routes.",
    "Return a submitted tool decision immediately, or finish with a precise abstention.",
  ],
  allocationPlan: {
    routes: [{ inputToken: "0x...", outputToken: "0x...", inputAtomic: "positive atomic string" }],
    invariants: [
      "The sum allocated from each input must not exceed its signed maximumAtomic.",
      "Every route output must be a signed minimum-increase outcome token.",
      "Quote-backed minimum outputs must cover every signed outcome floor in aggregate.",
      "Stage, transaction, approval, native-value, deadline, and evidence limits remain authoritative.",
    ],
  },
} as const;
