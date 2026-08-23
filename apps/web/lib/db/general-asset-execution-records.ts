import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hash, type Hex } from "viem";
import type { ReceiptLogV4 } from "../execution-v4/receipt-reconciler";
import type {
  cobiaGeneralAssetPrograms,
  cobiaGeneralAssetStages,
  StoredDeliveryV4,
} from "./general-asset-execution-schema";

export interface GeneralAssetProgramRecordInputV4 {
  programId: Hash;
  canonicalProgramHash: Hash;
  owner: Address;
  finalOutput: { chainId: 1 | 196; token: Address; minimumAtomic: string };
}

export interface GeneralAssetStageRecordInputV4 {
  programId: Hash;
  stageId: Hash;
  ordinal: number;
  chainId: 1 | 196;
  predecessorStageId: Hash | null;
  sender: Address;
  inputToken: Address;
  target: Address;
  valueAtomic: string;
  calldata: Hex;
  expectedNonce: string;
  requiredConfirmations: number;
  expectedLogs: ReceiptLogV4[];
  delivery: StoredDeliveryV4;
}

export interface BridgeDeliveryEvidenceV4 {
  messageId: Hash;
  sourceTransactionHash: Hash;
  destinationChainId: 1 | 196;
  recipient: Address;
  token: Address;
  amountAtomic: string;
  deliveryTransactionHash: Hash;
}

type ProgramRow = typeof cobiaGeneralAssetPrograms.$inferSelect;
type StageRow = typeof cobiaGeneralAssetStages.$inferSelect;
const HASH = /^0x[0-9a-f]{64}$/;
const ATOMIC = /^(0|[1-9][0-9]*)$/;

export function assertCanonicalHashV4(value: string, label: string): void {
  if (!HASH.test(value) || /^0x0{64}$/.test(value)) throw new Error(`${label} is invalid`);
}

function assertAddress(value: string, label: string): void {
  if (!isAddress(value) || value !== value.toLowerCase()) throw new Error(`${label} is invalid`);
}

function assertAtomic(value: string, label: string, positive = false): void {
  if (!ATOMIC.test(value) || (positive && value === "0")) throw new Error(`${label} is invalid`);
}

export function assertGeneralAssetInputs(
  program: GeneralAssetProgramRecordInputV4,
  stage: GeneralAssetStageRecordInputV4,
): void {
  if (![1, 196].includes(program.finalOutput.chainId) || ![1, 196].includes(stage.chainId)) {
    throw new Error("General asset chain is unsupported");
  }
  assertCanonicalHashV4(program.programId, "Program id");
  assertCanonicalHashV4(program.canonicalProgramHash, "Canonical program hash");
  if (program.programId !== program.canonicalProgramHash) throw new Error("Program hash is inconsistent");
  assertAddress(program.owner, "Program owner");
  assertAddress(program.finalOutput.token, "Final output token");
  assertAtomic(program.finalOutput.minimumAtomic, "Final output minimum", true);
  assertCanonicalHashV4(stage.stageId, "Stage id");
  if (stage.programId !== program.programId || !Number.isInteger(stage.ordinal) || stage.ordinal < 0) {
    throw new Error("Stage program or ordinal is invalid");
  }
  if (stage.predecessorStageId) {
    assertCanonicalHashV4(stage.predecessorStageId, "Predecessor stage id");
  }
  assertAddress(stage.sender, "Stage sender");
  if (stage.sender !== program.owner) throw new Error("Stage sender does not match program owner");
  assertAddress(stage.inputToken, "Stage input token");
  assertAddress(stage.target, "Stage target");
  assertAtomic(stage.valueAtomic, "Stage value");
  assertAtomic(stage.expectedNonce, "Expected nonce");
  if (!/^0x(?:[0-9a-f]{2}){4,}$/.test(stage.calldata) ||
      !Number.isInteger(stage.requiredConfirmations) || stage.requiredConfirmations < 1 ||
      stage.requiredConfirmations > 256) throw new Error("Stage finality or calldata is invalid");
  for (const log of stage.expectedLogs) {
    assertAddress(log.address, "Expected log address");
    log.topics.forEach((topic) => assertCanonicalHashV4(topic, "Expected log topic"));
    if (!/^0x(?:[0-9a-f]{2})*$/.test(log.data)) throw new Error("Expected log data is invalid");
  }
  if (stage.expectedLogs.length > 64) throw new Error("Expected log count is invalid");
  if (stage.delivery.kind === "bridge") {
    if (![1, 196].includes(stage.delivery.destinationChainId)) {
      throw new Error("Delivery chain is unsupported");
    }
    assertAddress(stage.delivery.recipient, "Delivery recipient");
    assertAddress(stage.delivery.token, "Delivery token");
    assertAtomic(stage.delivery.minimumAtomic, "Delivery minimum", true);
  }
}

export function assertBridgeDeliveryEvidenceV4(input: BridgeDeliveryEvidenceV4): void {
  assertCanonicalHashV4(input.messageId, "Bridge message id");
  assertCanonicalHashV4(input.sourceTransactionHash, "Bridge source transaction");
  assertCanonicalHashV4(input.deliveryTransactionHash, "Bridge delivery transaction");
  assertAddress(input.recipient, "Bridge recipient");
  assertAddress(input.token, "Bridge token");
  assertAtomic(input.amountAtomic, "Bridge amount", true);
}

export function assertProgramRetry(row: ProgramRow, input: GeneralAssetProgramRecordInputV4) {
  const matches = row.id === input.programId && row.canonicalProgramHash === input.canonicalProgramHash &&
    row.owner === input.owner && row.finalOutputChainId === input.finalOutput.chainId &&
    row.finalOutputToken === input.finalOutput.token &&
    row.finalOutputMinimumAtomic === input.finalOutput.minimumAtomic;
  if (!matches) throw new Error("General asset program conflicts with stored authority");
}

export function assertStageRetry(row: StageRow, input: GeneralAssetStageRecordInputV4) {
  const matches = row.programId === input.programId && row.stageId === input.stageId &&
    row.ordinal === input.ordinal && row.chainId === input.chainId &&
    row.predecessorStageId === input.predecessorStageId && row.sender === input.sender &&
    row.inputToken === input.inputToken && row.target === input.target &&
    row.valueAtomic === input.valueAtomic &&
    row.calldata === input.calldata && row.expectedNonce === input.expectedNonce &&
    row.requiredConfirmations === input.requiredConfirmations &&
    commitment(row.expectedLogs) === commitment(input.expectedLogs) &&
    commitment(row.delivery) === commitment(input.delivery);
  if (!matches) throw new Error("General asset stage conflicts with stored transaction");
}

export const sameEvidenceV4 = (left: unknown, right: unknown) =>
  commitment(left) === commitment(right);
