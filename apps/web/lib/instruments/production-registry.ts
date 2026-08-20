import { isAddressEqual } from "viem";
import { RwaInstrumentV1Schema, type RwaInstrumentV1 } from "./types";

type Query = {
  chainId: number;
  token: string;
  jurisdiction: string;
  nowSec: number;
};

export class InstrumentRegistryError extends Error {
  constructor(public readonly code:
    | "INSTRUMENT_NOT_REGISTERED"
    | "INSTRUMENT_JURISDICTION_UNSUPPORTED"
    | "INSTRUMENT_EVIDENCE_STALE") {
    super(code);
    this.name = "InstrumentRegistryError";
  }
}

function identity({ chainId, token }: Pick<RwaInstrumentV1, "chainId" | "token">): string {
  return `${chainId}:${token}`;
}

export function createInstrumentRegistryV1(entries: readonly unknown[]): readonly RwaInstrumentV1[] {
  const parsed = entries.map((entry) => RwaInstrumentV1Schema.parse(entry));
  const identities = parsed.map(identity);
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate instrument identity");
  return Object.freeze(parsed.map((entry) => Object.freeze(entry)));
}

const PRODUCTION_REGISTRY = createInstrumentRegistryV1([]);

export function productionInstrumentRegistryV1(): readonly RwaInstrumentV1[] {
  return PRODUCTION_REGISTRY;
}

export function resolveInstrumentFromRegistryV1(
  registry: readonly RwaInstrumentV1[],
  query: Query,
): RwaInstrumentV1 {
  const found = registry.find((entry) => entry.chainId === query.chainId &&
    isAddressEqual(entry.token as `0x${string}`, query.token as `0x${string}`));
  if (!found) throw new InstrumentRegistryError("INSTRUMENT_NOT_REGISTERED");
  if (!found.eligibleJurisdictions.includes(query.jurisdiction)) {
    throw new InstrumentRegistryError("INSTRUMENT_JURISDICTION_UNSUPPORTED");
  }
  if (found.evidenceExpiresAt <= query.nowSec) {
    throw new InstrumentRegistryError("INSTRUMENT_EVIDENCE_STALE");
  }
  return found;
}

export function resolveInstrumentV1(query: Query): RwaInstrumentV1 {
  return resolveInstrumentFromRegistryV1(PRODUCTION_REGISTRY, query);
}

export { RwaInstrumentV1Schema } from "./types";
