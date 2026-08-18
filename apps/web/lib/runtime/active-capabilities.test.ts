import { describe, expect, it } from "vitest";
import { assertPolicyTargetsActiveManifest } from "./active-capabilities";

const hash = `0x${"11".repeat(32)}`;
const manifest = {
  registryHash: hash,
  capabilities: [{ id: "aave-v3.supply", version: 1 }],
};

describe("active capability admission", () => {
  it("accepts only exact manifest and capability identities", () => {
    expect(() => assertPolicyTargetsActiveManifest({
      manifestHash: hash,
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
    }, manifest)).not.toThrow();
    expect(() => assertPolicyTargetsActiveManifest({
      manifestHash: `0x${"22".repeat(32)}`,
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
    }, manifest)).toThrow("inactive capability manifest");
    expect(() => assertPolicyTargetsActiveManifest({
      manifestHash: hash,
      allowedCapabilities: [{ id: "unknown.execute", version: 1 }],
    }, manifest)).toThrow("unsupported capability");
    expect(() => assertPolicyTargetsActiveManifest({
      manifestHash: hash,
      allowedCapabilities: [{ id: "aave-v3.supply", version: 2 }],
    }, manifest)).toThrow("unsupported capability");
  });
});
