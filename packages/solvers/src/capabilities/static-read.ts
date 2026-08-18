import {
  StaticPredicateV1Schema,
  StaticReadV1Schema,
  commitment,
  type StaticPredicateV1,
  type StaticReadV1,
} from "@cobia/domain";
import { getAddress, size, sliceHex, type Address, type Hash, type Hex } from "viem";

export type StaticReadErrorCodeV1 = "CODE_MISMATCH" | "CALL_FAILED" | "RETURN_INVALID";

export class StaticReadErrorV1 extends Error {
  constructor(readonly code: StaticReadErrorCodeV1, message: string) {
    super(message);
  }
}

export interface StaticReadCallerV1 {
  getCodeHash(target: Address): Promise<Hash | undefined>;
  call(input: { target: Address; data: Hex; gasLimit: number }): Promise<{
    success: boolean;
    returnData: Hex;
  }>;
}

export interface StaticReadResultV1 {
  readHash: Hash;
  returnData: Hex;
  decodedValue: string;
}

function decodeWord(read: StaticReadV1, word: Hex): string {
  const raw = BigInt(word);
  switch (read.decodeType) {
    case "uint256": return raw.toString();
    case "int256": return BigInt.asIntN(256, raw).toString();
    case "address": {
      if (!/^0x0{24}[0-9a-f]{40}$/.test(word)) {
        throw new StaticReadErrorV1("RETURN_INVALID", "Address return word has dirty high bytes");
      }
      return getAddress(`0x${word.slice(-40)}`).toLowerCase();
    }
    case "bool": {
      if (raw !== 0n && raw !== 1n) {
        throw new StaticReadErrorV1("RETURN_INVALID", "Boolean return word is not canonical");
      }
      return raw === 1n ? "true" : "false";
    }
    case "bytes32": return word;
  }
}

export async function evaluateStaticReadV1(
  input: unknown,
  caller: StaticReadCallerV1,
): Promise<StaticReadResultV1> {
  const read = StaticReadV1Schema.parse(input);
  if (await caller.getCodeHash(read.target) !== read.runtimeCodeHash) {
    throw new StaticReadErrorV1("CODE_MISMATCH", "Static read target code changed");
  }
  const response = await caller.call({
    target: read.target,
    data: read.data,
    gasLimit: read.gasLimit,
  });
  if (!response.success) throw new StaticReadErrorV1("CALL_FAILED", "Static read reverted");
  const returnData = response.returnData.toLowerCase() as Hex;
  if (!/^0x(?:[0-9a-f]{2})+$/.test(returnData)) {
    throw new StaticReadErrorV1("RETURN_INVALID", "Static read returned malformed hex");
  }
  const bytes = size(returnData);
  const offset = read.returnWordIndex * 32;
  if (bytes < 32 || bytes > 4_096 || bytes % 32 !== 0 || offset + 32 > bytes) {
    throw new StaticReadErrorV1("RETURN_INVALID", "Static read returned an invalid ABI word range");
  }
  const word = sliceHex(returnData, offset, offset + 32);
  return {
    readHash: commitment(read),
    returnData,
    decodedValue: decodeWord(read, word),
  };
}

function compare(predicate: StaticPredicateV1, actual: string): boolean {
  if (predicate.decodeType === "uint256" || predicate.decodeType === "int256") {
    const left = BigInt(actual);
    const right = BigInt(predicate.bound);
    if (predicate.comparator === "gte") return left >= right;
    if (predicate.comparator === "lte") return left <= right;
    return left === right;
  }
  return actual.toLowerCase() === predicate.bound.toLowerCase();
}

export async function evaluateStaticPredicateV1(
  input: unknown,
  caller: StaticReadCallerV1,
) {
  const predicate = StaticPredicateV1Schema.parse(input);
  const { phase, comparator: _comparator, bound: _bound, ...read } = predicate;
  const result = await evaluateStaticReadV1(read, caller);
  return { ...result, phase, satisfied: compare(predicate, result.decodedValue) };
}
