export const PUBLIC_PROOF = {
  confirmedOutcomeFloor: 34,
  winningSolvers: 4,
  xStocks: {
    symbol: "TSLAx",
    programId: "3ceb168b-3a54-4560-ad9a-c1614401d6db",
    transactionHash: "0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f",
  },
} as const;

export const CONFIRMED_OUTCOME_LABEL = `${PUBLIC_PROOF.confirmedOutcomeFloor}+ confirmed outcomes`;
