import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { atomicProgramV3, executorV3 } from "../atomic-execution/v3-test-fixture";
import { createGeneralAttestationV3 } from "./general-attestation-v3";

const builderSuffix = "737136646c6a326f6e72386d6c357861100080218021802180218021802180218021";

describe("general V3 verifier attestation", () => {
  it("commits the Cobia Builder Code before the wallet receives executor calldata", async () => {
    const verifier = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const evidence = { replayHash: `0x${"22".repeat(32)}` };
    const attestation = await createGeneralAttestationV3({
      program: atomicProgramV3(),
      evidence,
      executor: executorV3,
      attestor: verifier.address,
      signTypedData: (typedData) => verifier.signTypedData(typedData),
    });

    expect(attestation.call.data.endsWith(builderSuffix)).toBe(true);
    expect(attestation.attestor).toBe(verifier.address);
    expect(attestation.evidenceHash).toBe(commitment(evidence));
  });
});
