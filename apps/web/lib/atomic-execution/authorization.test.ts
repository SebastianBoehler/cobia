import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { NOW_SEC } from "../execution-v2/test-fixtures";
import {
  buildAtomicAuthorizationTypedDataV1,
  signAtomicAuthorizationV1,
} from "./authorization";
import { projectAtomicRouteV1 } from "./project-route";
import { hashAtomicRouteV1 } from "./route-hash";
import { verifiedAtomicFixture } from "./test-fixture";

const executor = "0x2222222222222222222222222222222222222222" as const;
const simulationHash = `0x${"52".repeat(32)}` as const;
const nonce = `0x${"53".repeat(32)}` as const;

async function projectedFixture() {
  return projectAtomicRouteV1({
    ...await verifiedAtomicFixture(),
    executor,
    simulationHash,
    nonce,
    nowSec: NOW_SEC,
  });
}

describe("atomic verifier authorization", () => {
  it("matches the Solidity route-hash regression vector", () => {
    expect(hashAtomicRouteV1({
      policyHash: `0x${"11".repeat(32)}`,
      snapshotHash: `0x${"22".repeat(32)}`,
      bundleHash: `0x${"33".repeat(32)}`,
      routeHash: `0x${"00".repeat(32)}`,
      simulationHash: `0x${"44".repeat(32)}`,
      owner: "0x1111111111111111111111111111111111111111",
      inputToken: "0x2222222222222222222222222222222222222222",
      inputAmount: 10_000_000n,
      deadline: 2_000_000_000,
      nonce: `0x${"55".repeat(32)}`,
      steps: [{
        adapterId: `0x${"66".repeat(32)}`,
        target: "0x3333333333333333333333333333333333333333",
        spendToken: "0x2222222222222222222222222222222222222222",
        spendAmount: 10_000_000n,
        data: "0xabcdef01",
      }],
      constraints: [{
        token: "0x4444444444444444444444444444444444444444",
        account: "0x1111111111111111111111111111111111111111",
        minimumIncrease: 9_999_999n,
      }],
    })).toBe("0x6bd63fd720b08b7b464617b929082ded8db5dd0fc648c4fc77ea3ff10f997d62");
  });

  it("signs the exact chain, executor, route, owner, nonce, and deadline", async () => {
    const projected = await projectedFixture();
    const real = privateKeyToAccount(`0x${"61".repeat(32)}`);
    const signTypedData = vi.fn(
      (typedData: ReturnType<typeof buildAtomicAuthorizationTypedDataV1>) =>
        real.signTypedData(typedData),
    );
    const signed = await signAtomicAuthorizationV1(
      { projected, nowSec: NOW_SEC },
      { account: { address: real.address, signTypedData } },
    );

    expect(signTypedData).toHaveBeenCalledOnce();
    const typedData = buildAtomicAuthorizationTypedDataV1(projected);
    expect(typedData.domain).toEqual({
      name: "CobiaAtomicExecutor",
      version: "1",
      chainId: 196,
      verifyingContract: executor,
    });
    await expect(recoverTypedDataAddress({
      ...typedData,
      signature: signed.signature,
    })).resolves.toBe(real.address);
  });

  it("never signs cloned or field-mutated projected routes", async () => {
    const projected = await projectedFixture();
    const account = privateKeyToAccount(`0x${"61".repeat(32)}`);
    const signTypedData = vi.fn(
      (typedData: ReturnType<typeof buildAtomicAuthorizationTypedDataV1>) =>
        account.signTypedData(typedData),
    );
    const route = projected.route;
    const mutations = [
      { ...projected, executionChainId: 1952 },
      { ...projected, executor: "0x3333333333333333333333333333333333333333" },
      { ...projected, route: { ...route, inputAmount: route.inputAmount - 1n } },
      { ...projected, route: { ...route, deadline: route.deadline - 1 } },
      { ...projected, route: { ...route, nonce: `0x${"54".repeat(32)}` } },
      { ...projected, route: { ...route, simulationHash: `0x${"55".repeat(32)}` } },
      {
        ...projected,
        route: {
          ...route,
          steps: [{ ...route.steps[0], target: route.owner }],
        },
      },
      {
        ...projected,
        route: {
          ...route,
          constraints: [{ ...route.constraints[0], account: executor }],
        },
      },
    ];
    for (const candidate of mutations) {
      await expect(signAtomicAuthorizationV1(
        { projected: candidate as never, nowSec: NOW_SEC },
        { account: { address: account.address, signTypedData } },
      )).rejects.toThrow();
    }
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
