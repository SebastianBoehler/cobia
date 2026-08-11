export const PROTOCOL_INELIGIBLE_CODES = [
  "aave-reserve-inactive",
  "aave-reserve-frozen",
  "aave-reserve-paused",
  "aave-zero-scaled-amount",
  "aave-supply-cap-exceeded",
  "curve-zero-liquidity",
  "curve-zero-output",
  "uniswap-pool-locked",
  "uniswap-zero-liquidity",
  "uniswap-zero-output",
] as const;

export type ProtocolIneligibleCode = (typeof PROTOCOL_INELIGIBLE_CODES)[number];

const protocolIneligibleCodeSet = new Set<string>(PROTOCOL_INELIGIBLE_CODES);

export class ProtocolIneligibleError extends Error {
  readonly name = "ProtocolIneligibleError";
  readonly code: ProtocolIneligibleCode;

  constructor(code: ProtocolIneligibleCode, message: string) {
    super(message);
    if (!protocolIneligibleCodeSet.has(code)) {
      throw new TypeError("Unknown protocol ineligibility code");
    }
    this.code = code;
  }
}
