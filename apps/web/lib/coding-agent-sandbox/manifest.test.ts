import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { codingAgentAaveManifestV1 } from "./manifest";

describe("coding-agent Aave capability manifest", () => {
  it("derives only the existing USDG approval and Aave supply identities", () => {
    const manifest = codingAgentAaveManifestV1(
      PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
    );
    expect(manifest).toEqual(expect.objectContaining({ version: 1, chainId: 196 }));
    expect(manifest.deployments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        address: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
        runtimeCodeHash: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.runtimeCodeHash,
        capability: { kind: "erc20-approve", approvalSpenders: [PROTOCOL_REGISTRY.aaveV3.pool.address] },
      }),
      expect.objectContaining({
        address: PROTOCOL_REGISTRY.aaveV3.pool.address,
        runtimeCodeHash: PROTOCOL_REGISTRY.aaveV3.pool.runtimeCodeHash,
        capability: { kind: "aave-v3-supply" },
      }),
    ]));
  });

  it("does not manufacture a capability for an unregistered asset", () => {
    expect(() => codingAgentAaveManifestV1("0x1111111111111111111111111111111111111111"))
      .toThrow("not in the Aave registry");
  });
});
