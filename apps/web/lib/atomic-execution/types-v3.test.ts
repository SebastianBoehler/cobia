import { describe, expect, it } from "vitest";
import {
  assertAtomicExecutionProgramV3,
  atomicAuthorizationPayloadHashV3,
  atomicExecutionProgramHashV3,
  type AtomicAuthorizationV3,
} from "./types-v3";
import { atomicProgramV3, executorV3 } from "./v3-test-fixture";

describe("atomic capability executor V3 ABI model", () => {
  it("hashes the exact general program and authorization ABI", () => {
    const program = atomicProgramV3();
    const executionCommitment = atomicExecutionProgramHashV3(program);
    const authorization: AtomicAuthorizationV3 = {
      executor: executorV3, chainId: 196n, executionCommitment,
      policyHash: program.policyHash, manifestHash: program.manifestHash,
      canonicalProgramHash: program.canonicalProgramHash, simulationHash: program.simulationHash,
      pinnedBlockNumber: program.pinnedBlockNumber, pinnedBlockHash: program.pinnedBlockHash,
      owner: program.owner, inputToken: program.inputToken, inputAmount: program.inputAmount,
      deadline: program.deadline, nonce: program.nonce,
    };
    expect(executionCommitment).toBe(
      "0x08143c79d9233910fea0c1fd0377630099596f9076652ea43c1ac612cf732af1",
    );
    expect(atomicAuthorizationPayloadHashV3(authorization)).toBe(
      "0xe1aa36dea7800a403c2388b5daa76b69dbb0ef250e80b3e659dde637e2c8f3cf",
    );
  });

  it("rejects duplicate predicates, invalid primitive comparisons, and resource expansion", () => {
    const program = atomicProgramV3();
    expect(() => assertAtomicExecutionProgramV3({
      ...program, predicates: [program.predicates[0]!, program.predicates[0]!],
    })).toThrow(/unique/i);
    expect(() => assertAtomicExecutionProgramV3({
      ...program,
      predicates: [{ ...program.predicates[0]!, comparator: 1, read: { ...program.predicates[0]!.read, decodeType: 2 } }],
    })).toThrow(/comparison/i);
    expect(() => assertAtomicExecutionProgramV3({
      ...program, predicates: [{ ...program.predicates[0]!, read: { ...program.predicates[0]!.read, gasLimit: 250_001 } }],
    })).toThrow(/resource/i);
  });
});
