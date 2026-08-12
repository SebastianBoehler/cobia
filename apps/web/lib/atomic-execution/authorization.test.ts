import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createRepositoryFixtureV2 } from "../db/repository-test-fixtures";
import {
  atomicAuthorizationTypedDataV1,
  buildAtomicAuthorizationV1,
  signAtomicAuthorizationV1,
} from "./authorization";
import { projectAtomicRouteV1 } from "./project-route";

const EXECUTOR = "0x2222222222222222222222222222222222222222" as const;
const SIMULATION = `0x${"51".repeat(32)}` as const;
const NONCE = `0x${"52".repeat(32)}` as const;
const KEY = `0x${"63".repeat(32)}` as const;

async function projected() {
  const value = await createRepositoryFixtureV2({
    principalAtomic: "10000000",
    protocolExposureBps: 10_000,
    preferredRoute: "direct",
  });
  return projectAtomicRouteV1({
    ...value,
    executor: EXECUTOR,
    simulationHash: SIMULATION,
    nonce: NONCE,
    nowSec: 1_783_238_460,
  });
}

describe("atomic verifier authorization", () => {
  it("signs the exact Solidity payload under chain 196 and executor domain", async () => {
    const route = await projected();
    const authorization = buildAtomicAuthorizationV1(route, EXECUTOR);
    const signature = await signAtomicAuthorizationV1({
      route,
      authorization,
      expectedExecutor: EXECUTOR,
      verifierPrivateKey: KEY,
    });
    const recovered = await recoverTypedDataAddress({
      ...atomicAuthorizationTypedDataV1(authorization),
      signature,
    });
    expect(recovered).toBe(privateKeyToAccount(KEY).address);
  });

  it.each([
    ["executor", "0x3333333333333333333333333333333333333333"],
    ["chainId", 1952],
    ["routeCommitment", `0x${"71".repeat(32)}`],
    ["policyHash", `0x${"72".repeat(32)}`],
    ["snapshotHash", `0x${"73".repeat(32)}`],
    ["bundleHash", `0x${"74".repeat(32)}`],
    ["routeHash", `0x${"75".repeat(32)}`],
    ["simulationHash", `0x${"76".repeat(32)}`],
    ["constraintsHash", `0x${"77".repeat(32)}`],
    ["owner", "0x4444444444444444444444444444444444444444"],
    ["inputToken", "0x5555555555555555555555555555555555555555"],
    ["inputAmount", 1n],
    ["deadline", 1n],
    ["nonce", `0x${"78".repeat(32)}`],
  ] as const)("rejects a changed %s before signing", async (field, changed) => {
    const route = await projected();
    const authorization = buildAtomicAuthorizationV1(route, EXECUTOR);
    const sign = vi.fn();
    await expect(signAtomicAuthorizationV1({
      route,
      authorization: { ...authorization, [field]: changed },
      expectedExecutor: EXECUTOR,
      verifierPrivateKey: KEY,
      signTypedData: sign,
    })).rejects.toThrow("does not match");
    expect(sign).not.toHaveBeenCalled();
  });
});
