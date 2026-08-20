import { describe, expect, it } from "vitest";
import {
  InstrumentRegistryError,
  RwaInstrumentV1Schema,
  createInstrumentRegistryV1,
  productionInstrumentRegistryV1,
  resolveInstrumentFromRegistryV1,
  resolveInstrumentV1,
} from "./production-registry";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const entry = {
  version: 1 as const,
  chainId: 196 as const,
  token: "0x1111111111111111111111111111111111111111",
  displayName: "Example Treasury Fund",
  symbol: "ETF",
  platform: "Example Platform",
  issuer: "Example Issuer AG",
  underlyingIdentifier: "US0123456789",
  claimClass: "beneficial-interest" as const,
  eligibleJurisdictions: ["DE"],
  eligibilityNote: "Eligible verified investors only.",
  acquisitionProvider: "lifi@1" as const,
  restrictionsHash: hash("1"),
  runtimeCodeHash: hash("2"),
  implementationCodeHash: hash("3"),
  officialSources: [{ url: "https://issuer.example/disclosure", contentHash: hash("4") }],
  evidenceExpiresAt: 2_000_000_300,
};

describe("tokenized instrument registry", () => {
  it("ships only issuer-sourced production identities", () => {
    expect(productionInstrumentRegistryV1()).toHaveLength(3);
    expect(() => resolveInstrumentV1({
      chainId: 196,
      token: entry.token,
      jurisdiction: "DE",
      nowSec: 2_000_000_000,
    })).toThrowError(expect.objectContaining({ code: "INSTRUMENT_NOT_REGISTERED" }));
  });

  it("requires exact identity and rejects ticker-only or incomplete records", () => {
    expect(RwaInstrumentV1Schema.safeParse({ ticker: "SPACEX" }).success).toBe(false);
    expect(RwaInstrumentV1Schema.safeParse({ ...entry, officialSources: [] }).success).toBe(false);
    expect(RwaInstrumentV1Schema.safeParse({ ...entry, runtimeCodeHash: undefined }).success).toBe(false);
  });

  it("rejects duplicate representations, stale evidence, and ineligible jurisdictions", () => {
    expect(() => createInstrumentRegistryV1([entry, entry])).toThrow("Duplicate instrument identity");
    const registry = createInstrumentRegistryV1([entry]);
    expect(() => resolveInstrumentFromRegistryV1(registry, {
      chainId: 196, token: entry.token, jurisdiction: "US", nowSec: 2_000_000_000,
    })).toThrowError(expect.objectContaining({ code: "INSTRUMENT_JURISDICTION_UNSUPPORTED" }));
    expect(() => resolveInstrumentFromRegistryV1(registry, {
      chainId: 196, token: entry.token, jurisdiction: "DE", nowSec: entry.evidenceExpiresAt,
    })).toThrowError(expect.objectContaining({ code: "INSTRUMENT_EVIDENCE_STALE" }));
  });

  it("resolves only the exact chain, token, jurisdiction, and fresh evidence tuple", () => {
    const registry = createInstrumentRegistryV1([entry]);
    expect(resolveInstrumentFromRegistryV1(registry, {
      chainId: 196, token: entry.token, jurisdiction: "DE", nowSec: 2_000_000_000,
    })).toEqual(RwaInstrumentV1Schema.parse(entry));
    expect(() => resolveInstrumentFromRegistryV1(registry, {
      chainId: 1, token: entry.token, jurisdiction: "DE", nowSec: 2_000_000_000,
    })).toThrow(InstrumentRegistryError);
  });
});
