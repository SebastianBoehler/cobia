import { describe, expect, it } from "vitest";
import { RegisteredAdapterManifestV1Schema } from "../src/general-assets/adapter-manifest";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const target = "0x1111111111111111111111111111111111111111";
const emitter = "0x2222222222222222222222222222222222222222";

function manifest() {
  return { version: 1 as const, entries: [{ providerFamily: "lifi" as const,
    adapter: { id: "lifi.route", version: 1 }, chainId: 196 as const, target,
    runtimeCodeHash: hash("1"), selectors: ["0x12345678"], approvalSpenders: [target],
    bridgeDelivery: { statusProvider: "lifi" as const, destinationChainId: 1 as const,
      destinationEmitters: [{ address: emitter, runtimeCodeHash: hash("2") }] } }] };
}

describe("registered general asset adapter manifest", () => {
  it("binds LI.FI delivery to destination chain, emitter, and runtime code", () => {
    expect(RegisteredAdapterManifestV1Schema.parse(manifest()).entries[0]!.bridgeDelivery)
      .toEqual({ statusProvider: "lifi", destinationChainId: 1,
        destinationEmitters: [{ address: emitter, runtimeCodeHash: hash("2") }] });
  });

  it("rejects delivery semantics on another provider or duplicate emitters", () => {
    expect(() => RegisteredAdapterManifestV1Schema.parse({ ...manifest(), entries: [{
      ...manifest().entries[0], providerFamily: "okx", adapter: { id: "okx.swap", version: 1 },
    }] })).toThrow();
    expect(() => RegisteredAdapterManifestV1Schema.parse({ ...manifest(), entries: [{
      ...manifest().entries[0], bridgeDelivery: { ...manifest().entries[0]!.bridgeDelivery,
        destinationEmitters: [manifest().entries[0]!.bridgeDelivery.destinationEmitters[0],
          manifest().entries[0]!.bridgeDelivery.destinationEmitters[0]] },
    }] })).toThrow();
  });
});
