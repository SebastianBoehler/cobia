import { isNativeAssetAddress,
  type GeneralAssetPolicyV1, type GeneralAssetProgramV1 } from "@cobia/domain";

function assetKey(chainId: number, token: string): string {
  return `${chainId}:${token}`;
}

export function assessGeneralAssetPolicyProgramV1(
  policy: GeneralAssetPolicyV1,
  program: GeneralAssetProgramV1,
  errors: Set<string>,
): void {
  const first = program.stages[0]!;
  const final = program.stages.at(-1)!;
  if (first.chainId !== policy.sourceChainId || first.input.token !== policy.input.token ||
      BigInt(first.input.maximumAtomic) > BigInt(policy.input.maximumAtomic) ||
      final.chainId !== policy.destinationChainId) errors.add("POLICY_ASSET_MISMATCH");
  for (const expected of policy.outputs) {
    const actual = final.outputs.find(({ token }) => token === expected.token);
    if (expected.chainId !== final.chainId || !actual ||
        actual.identityEvidenceHash !== expected.identityHash ||
        BigInt(actual.minimumIncreaseAtomic) < BigInt(expected.minimumAtomic)) {
      errors.add("POLICY_ASSET_MISMATCH");
    }
  }
  const forbiddenAssets = new Set(policy.forbiddenAssets.map(({ chainId, token }) =>
    assetKey(chainId, token)));
  const forbiddenTargets = new Set(policy.forbiddenTargets.map(({ chainId, target }) =>
    `${chainId}:${target}`));
  let approvals = 0;
  let calldataBytes = 0;
  for (const stage of program.stages) {
    approvals += stage.calls.reduce((sum, call) => sum + call.approvals.length, 0);
    calldataBytes += stage.calls.reduce((sum, call) => sum + (call.calldata.length - 2) / 2, 0);
    const gas = stage.calls.reduce((sum, call) => sum + BigInt(call.gasLimit), 0n);
    const nativeValue = stage.calls.reduce((sum, call) => sum + BigInt(call.nativeValueAtomic), 0n);
    if (stage.calls.length > policy.limits.maxCallsPerStage ||
        gas > BigInt(policy.limits.maxGasPerStage)) errors.add("LIMIT_EXCEEDED");
    if (isNativeAssetAddress(stage.input.token)) {
      if (nativeValue > BigInt(stage.input.maximumAtomic)) errors.add("LIMIT_EXCEEDED");
    } else if (nativeValue > 0n) {
      errors.add("NATIVE_VALUE_EVIDENCE_MISSING");
    }
    if (stage.calls.some(({ target }) => forbiddenTargets.has(`${stage.chainId}:${target}`))) {
      errors.add("FORBIDDEN_TARGET");
    }
    if (forbiddenAssets.has(assetKey(stage.chainId, stage.input.token)) ||
        stage.outputs.some(({ token }) => forbiddenAssets.has(assetKey(stage.chainId, token)))) {
      errors.add("FORBIDDEN_ASSET");
    }
  }
  if (approvals > policy.limits.maxApprovals || calldataBytes > policy.limits.maxCalldataBytes) {
    errors.add("LIMIT_EXCEEDED");
  }
}
