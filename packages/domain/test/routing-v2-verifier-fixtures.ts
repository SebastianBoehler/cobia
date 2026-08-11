import { commitment, type RouteBundleV2 } from "../src/index";
import { privateKeyToAccount } from "viem/accounts";
import { bundleV2, policyV2, snapshotV2 } from "./routing-v2-fixtures";

export const verifierSolver = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const otherVerifierSolver = privateKeyToAccount(`0x${"22".repeat(32)}`);
export const verifierCapturedAtSec = Math.floor(
  Date.parse(snapshotV2.capturedAt) / 1_000,
);
export const verifierCutoffSec =
  verifierCapturedAtSec + policyV2.maxSnapshotAgeSec;

export async function signedRouteBundleV2(
  change: Partial<Omit<RouteBundleV2, "signature">> = {},
  signer = verifierSolver,
): Promise<RouteBundleV2> {
  const unsigned = {
    ...bundleV2,
    solverAddress: verifierSolver.address.toLowerCase() as
      typeof bundleV2.solverAddress,
    estimatedPreGasApyBps: 23,
    validUntil: verifierCutoffSec,
    ...change,
  };
  const { signature: _ignored, ...withoutSignature } = unsigned;
  const signature = await signer.signMessage({
    message: { raw: commitment(withoutSignature) },
  });
  return { ...withoutSignature, signature };
}
