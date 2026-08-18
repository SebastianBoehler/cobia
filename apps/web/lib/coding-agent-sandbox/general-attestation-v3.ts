import { commitment } from "@cobia/domain";
import type { Address, Hex } from "viem";
import { buildAtomicAuthorizationV3, signAtomicAuthorizationV3 } from "../atomic-execution/authorization-v3";
import { encodeAtomicExecutionCallV3 } from "../atomic-execution/encode-v3";
import type { AtomicExecutionProgramV3 } from "../atomic-execution/types-v3";
import { attributeCobiaTransaction } from "../chain/xlayer-builder-attribution";

export async function createGeneralAttestationV3(input: {
  program: AtomicExecutionProgramV3;
  evidence: unknown;
  executor: Address;
  attestor: Address;
  signTypedData: Parameters<typeof signAtomicAuthorizationV3>[0]["signTypedData"];
}) {
  const authorization = buildAtomicAuthorizationV3(input.program, input.executor);
  const signature: Hex = await signAtomicAuthorizationV3({
    program: input.program,
    authorization,
    expectedExecutor: input.executor,
    signTypedData: input.signTypedData,
  });
  return {
    version: 3 as const,
    authorization,
    signature,
    call: attributeCobiaTransaction(encodeAtomicExecutionCallV3({
      program: input.program,
      authorization,
      signature,
      expectedExecutor: input.executor,
    })),
    attestor: input.attestor,
    evidenceHash: commitment(input.evidence),
  };
}
