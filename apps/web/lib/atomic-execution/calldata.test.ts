import { decodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { NOW_SEC } from "../execution-v2/test-fixtures";
import { signAtomicAuthorizationV1 } from "./authorization";
import {
  ATOMIC_EXECUTOR_ABI,
  buildAtomicExecutionTransactionV1,
} from "./calldata";
import { projectAtomicRouteV1 } from "./project-route";
import { verifiedAtomicFixture } from "./test-fixture";

const executor = "0x2222222222222222222222222222222222222222" as const;

async function signedFixture(kind: "direct" | "curve" | "uniswap" = "direct") {
  const projected = projectAtomicRouteV1({
    ...await verifiedAtomicFixture(kind),
    executor,
    simulationHash: `0x${"52".repeat(32)}`,
    nonce: `0x${"53".repeat(32)}`,
    nowSec: NOW_SEC,
  });
  const account = privateKeyToAccount(`0x${"61".repeat(32)}`);
  const signed = await signAtomicAuthorizationV1(
    { projected, nowSec: NOW_SEC },
    { account },
  );
  return { projected, signed };
}

describe("buildAtomicExecutionTransactionV1", () => {
  it.each(["direct", "curve", "uniswap"] as const)(
    "encodes one zero-value executor transaction for %s",
    async (kind) => {
      const { projected, signed } = await signedFixture(kind);
      const transaction = buildAtomicExecutionTransactionV1(projected, signed);
      expect(transaction).toMatchObject({
        label: "cobia-atomic-route-v1",
        chainId: 196,
        from: projected.route.owner,
        to: executor,
        value: 0n,
      });
      const decoded = decodeFunctionData({
        abi: ATOMIC_EXECUTOR_ABI,
        data: transaction.data,
      });
      expect(decoded.functionName).toBe("execute");
      expect(decoded.args?.[0]).toMatchObject({
        routeHash: projected.route.routeHash,
        steps: projected.route.steps,
        constraints: projected.route.constraints,
      });
      expect(decoded.args?.[1]).toEqual({
        routeHash: signed.authorization.routeHash,
        validUntil: BigInt(signed.authorization.validUntil),
      });
      expect(decoded.args?.[2]).toBe(signed.signature);
    },
  );

  it("rejects mismatched authorization and malformed signatures", async () => {
    const { projected, signed } = await signedFixture();
    expect(() => buildAtomicExecutionTransactionV1(projected, {
      ...signed,
      authorization: {
        ...signed.authorization,
        validUntil: signed.authorization.validUntil - 1,
      },
    })).toThrow("authorization");
    expect(() => buildAtomicExecutionTransactionV1(projected, {
      ...signed,
      signature: "0x12",
    })).toThrow("signature");
  });
});
