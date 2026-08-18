export const cobiaCodingAgentProfile: {
  id: string;
  displayName: string;
  operatorKind: "internal";
  attestationAddress: null;
  declaredCapabilities: string[];
} = {
  id: "cobia-coding-agent",
  displayName: "Cobia Coding Agent",
  operatorKind: "internal",
  attestationAddress: null,
  declaredCapabilities: [
    "aave-v3.supply",
    "curve-stableswap-ng.exact-input",
    "uniswap-v3.exact-input",
  ],
};
