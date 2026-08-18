import { isAddressEqual, type Address } from "viem";
import type { CompiledCapabilityActionV1 } from "./module";
import type { CapabilityProgramV1 } from "./program";
import type { CapabilityProgramV2 } from "./program-v2";

export type CapabilityAssetFlowErrorCode =
  | "ACTION_COUNT_MISMATCH"
  | "ACTION_IDENTITY_MISMATCH"
  | "CONSTRAINT_ACCOUNT_MISMATCH"
  | "FINAL_CONSTRAINT_NOT_GUARANTEED"
  | "INSUFFICIENT_GUARANTEED_BALANCE";

export interface CapabilityAssetFlowResultV1 {
  accepted: boolean;
  errorCodes: CapabilityAssetFlowErrorCode[];
  guaranteedOwnerDeltas: { token: Address; atomic: string }[];
}

function key(address: Address): string {
  return address.toLowerCase();
}

function add(balance: Map<string, bigint>, token: Address, amount: bigint): void {
  balance.set(key(token), (balance.get(key(token)) ?? 0n) + amount);
}

interface FlowProgram {
  owner: Address;
  executor: Address;
  input: { token: Address; atomic: string };
  actions: readonly { capabilityId: string; capabilityVersion: number }[];
  constraints: readonly { token: Address; account: Address; minimumIncreaseAtomic: string }[];
}

function verifyCapabilityAssetFlow(
  program: FlowProgram,
  compiled: readonly CompiledCapabilityActionV1[],
): CapabilityAssetFlowResultV1 {
  const errors = new Set<CapabilityAssetFlowErrorCode>();
  const available = new Map<string, bigint>();
  const ownerOutputs = new Map<string, bigint>();
  add(available, program.input.token, BigInt(program.input.atomic));
  if (compiled.length !== program.actions.length) errors.add("ACTION_COUNT_MISMATCH");

  for (const [index, action] of compiled.entries()) {
    const declared = program.actions[index];
    if (!declared || declared.capabilityId !== action.capabilityId ||
      declared.capabilityVersion !== action.capabilityVersion) {
      errors.add("ACTION_IDENTITY_MISMATCH");
    }
    for (const spend of action.spend) {
      const current = available.get(key(spend.token)) ?? 0n;
      const amount = BigInt(spend.atomic);
      if (amount > current) {
        errors.add("INSUFFICIENT_GUARANTEED_BALANCE");
      } else {
        available.set(key(spend.token), current - amount);
      }
    }
    for (const output of action.guaranteedOutputs) {
      const amount = BigInt(output.minimumIncreaseAtomic);
      if (isAddressEqual(output.account, program.executor)) {
        add(available, output.token, amount);
      } else if (isAddressEqual(output.account, program.owner)) {
        add(ownerOutputs, output.token, amount);
      }
    }
  }

  for (const [token, amount] of available) {
    ownerOutputs.set(token, (ownerOutputs.get(token) ?? 0n) + amount);
  }
  ownerOutputs.set(
    key(program.input.token),
    (ownerOutputs.get(key(program.input.token)) ?? 0n) - BigInt(program.input.atomic),
  );
  const guaranteedOwnerDeltas = [...ownerOutputs.entries()]
    .filter(([, amount]) => amount > 0n)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, amount]) => ({ token: token as Address, atomic: amount.toString() }));

  for (const constraint of program.constraints) {
    if (!isAddressEqual(constraint.account, program.owner)) {
      errors.add("CONSTRAINT_ACCOUNT_MISMATCH");
      continue;
    }
    const guaranteed = ownerOutputs.get(key(constraint.token)) ?? 0n;
    if (guaranteed < BigInt(constraint.minimumIncreaseAtomic)) {
      errors.add("FINAL_CONSTRAINT_NOT_GUARANTEED");
    }
  }
  return {
    accepted: errors.size === 0,
    errorCodes: [...errors].sort(),
    guaranteedOwnerDeltas,
  };
}

export function verifyCapabilityAssetFlowV1(
  program: CapabilityProgramV1,
  compiled: readonly CompiledCapabilityActionV1[],
): CapabilityAssetFlowResultV1 {
  return verifyCapabilityAssetFlow(program, compiled);
}

export function verifyCapabilityAssetFlowV2(
  program: CapabilityProgramV2,
  compiled: readonly CompiledCapabilityActionV1[],
): CapabilityAssetFlowResultV1 {
  return verifyCapabilityAssetFlow({
    ...program,
    constraints: program.balanceConstraints
      .filter(({ kind }) => kind === "minimumIncrease")
      .map(({ token, atomic }) => ({
        token,
        account: program.owner,
        minimumIncreaseAtomic: atomic,
      })),
  }, compiled);
}
