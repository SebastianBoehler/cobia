import { describe, expect, it } from "vitest";
import {
  atomicAuthorizationPayloadHashV1,
  atomicConstraintsHashV1,
  atomicRouteCommitmentV1,
  type AtomicAuthorizationV1,
  type AtomicRouteV1,
} from "./types";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

export const INTEROP_ROUTE: AtomicRouteV1 = {
  policyHash: hash("1"), snapshotHash: hash("2"), bundleHash: hash("3"),
  routeHash: hash("4"), simulationHash: hash("5"),
  owner: "0x1111111111111111111111111111111111111111",
  inputToken: "0x2222222222222222222222222222222222222222",
  inputAmount: 1_000_000n, deadline: 2_000_000_000n, nonce: hash("6"),
  steps: [{
    adapterId: hash("7"), target: "0x3333333333333333333333333333333333333333",
    spendToken: "0x2222222222222222222222222222222222222222",
    spendAmount: 1_000_000n, data: "0x12345678",
  }],
  constraints: [{
    token: "0x4444444444444444444444444444444444444444",
    account: "0x1111111111111111111111111111111111111111",
    minimumIncrease: 999_999n,
  }],
};

describe("Solidity / TypeScript atomic ABI interop", () => {
  it("locks route, constraint, and authorization payload hashes", () => {
    const routeCommitment = atomicRouteCommitmentV1(INTEROP_ROUTE);
    const constraintsHash = atomicConstraintsHashV1(INTEROP_ROUTE.constraints);
    const authorization: AtomicAuthorizationV1 = {
      executor: "0x5555555555555555555555555555555555555555",
      chainId: 196n,
      routeCommitment,
      policyHash: INTEROP_ROUTE.policyHash,
      snapshotHash: INTEROP_ROUTE.snapshotHash,
      bundleHash: INTEROP_ROUTE.bundleHash,
      routeHash: INTEROP_ROUTE.routeHash,
      simulationHash: INTEROP_ROUTE.simulationHash,
      constraintsHash,
      owner: INTEROP_ROUTE.owner,
      inputToken: INTEROP_ROUTE.inputToken,
      inputAmount: INTEROP_ROUTE.inputAmount,
      deadline: INTEROP_ROUTE.deadline,
      nonce: INTEROP_ROUTE.nonce,
    };

    expect({ routeCommitment, constraintsHash, authorizationPayloadHash:
      atomicAuthorizationPayloadHashV1(authorization) }).toEqual({
      routeCommitment: "0x0b47f854780f6988ec15b3df1d0af1b2fd2c84f46757c29aa255f0c19ea24615",
      constraintsHash: "0x3dce4dbe0751001cd8708406587f59fc9ceb94c8d104cdab41cdf7f8aabc8bb8",
      authorizationPayloadHash: "0xf6d4f9f1ddd7237a15cd495ef1f7b3d9b5cf4466a3ccc1b92da9e244376eb2b4",
    });
  });
});
