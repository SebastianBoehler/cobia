import { padHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateStaticPredicateV1,
  evaluateStaticReadV1,
} from "../src/index";

const target = "0x1111111111111111111111111111111111111111";
const runtimeCodeHash = `0x${"22".repeat(32)}` as const;
const read = {
  target,
  runtimeCodeHash,
  data: "0x12345678" as const,
  returnWordIndex: 0,
  decodeType: "uint256" as const,
  gasLimit: 50_000,
  label: "numeric metric",
};

function caller(returnData: `0x${string}`, codeHash = runtimeCodeHash) {
  return {
    getCodeHash: vi.fn(async () => codeHash),
    call: vi.fn(async () => ({ success: true as const, returnData })),
  };
}

describe("code-bound static reads", () => {
  it("selects and decodes the committed return word", async () => {
    const readAtWordOne = { ...read, returnWordIndex: 1 };
    const io = caller(`0x${"0".repeat(64)}${"0".repeat(63)}b`);

    const result = await evaluateStaticReadV1(readAtWordOne, io);

    expect(result.decodedValue).toBe("11");
    expect(result.returnData).toBe(`0x${"0".repeat(64)}${"0".repeat(63)}b`);
    expect(io.call).toHaveBeenCalledWith({
      target,
      data: "0x12345678",
      gasLimit: 50_000,
    });
  });

  it("evaluates signed numeric comparisons without unsigned reinterpretation", async () => {
    const negativeOne = `0x${"f".repeat(64)}` as const;
    const result = await evaluateStaticPredicateV1({
      ...read,
      decodeType: "int256",
      phase: "after",
      comparator: "gte",
      bound: "-2",
    }, caller(negativeOne));

    expect(result).toMatchObject({ decodedValue: "-1", satisfied: true, phase: "after" });
  });

  it("rejects code drift before issuing the call", async () => {
    const io = caller(padHex("0x01", { size: 32 }), `0x${"33".repeat(32)}`);

    await expect(evaluateStaticReadV1(read, io)).rejects.toMatchObject({ code: "CODE_MISMATCH" });
    expect(io.call).not.toHaveBeenCalled();
  });

  it("rejects reverted, short, oversized, and non-canonical return data", async () => {
    await expect(evaluateStaticReadV1(read, {
      getCodeHash: async () => runtimeCodeHash,
      call: async () => ({ success: false, returnData: "0x" }),
    })).rejects.toMatchObject({ code: "CALL_FAILED" });
    await expect(evaluateStaticReadV1(read, caller("0x01"))).rejects.toMatchObject({ code: "RETURN_INVALID" });
    await expect(evaluateStaticReadV1(read, caller(`0x${"00".repeat(4_097)}`))).rejects.toMatchObject({ code: "RETURN_INVALID" });
    await expect(evaluateStaticReadV1({ ...read, decodeType: "bool" }, caller(
      padHex("0x02", { size: 32 }),
    ))).rejects.toMatchObject({ code: "RETURN_INVALID" });
    await expect(evaluateStaticReadV1({ ...read, decodeType: "address" }, caller(
      `0x01${"0".repeat(22)}${target.slice(2)}`,
    ))).rejects.toMatchObject({ code: "RETURN_INVALID" });
  });

  it("returns false rather than treating a failed bound as safe", async () => {
    const result = await evaluateStaticPredicateV1({
      ...read,
      phase: "before",
      comparator: "lte",
      bound: "10",
    }, caller(padHex("0x0b", { size: 32 })));

    expect(result.satisfied).toBe(false);
  });
});
