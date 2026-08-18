import { getAddress, keccak256, type Address, type Hash, type Hex } from "viem";
import type { buildAgentExecutorDeploymentPlanV1 } from "./agent-executor-plan";

type DeploymentPlan = ReturnType<typeof buildAgentExecutorDeploymentPlanV1>;
type ContractField =
  | "owner"
  | "paused"
  | "executor"
  | "verifierSigner"
  | "registry"
  | "riskManager";

interface ChainTransaction {
  from: Address;
  to: Address | null;
  input: Hex;
  nonce: bigint;
  value: bigint;
}

interface ChainReceipt {
  status: "success" | "reverted";
  contractAddress: Address | null;
  blockNumber: bigint;
  blockHash: Hash;
}

export interface TestnetDeploymentReader {
  chainId(): Promise<number>;
  transaction(hash: Hash): Promise<ChainTransaction>;
  receipt(hash: Hash): Promise<ChainReceipt>;
  blockHash(blockNumber: bigint): Promise<Hash>;
  code(address: Address): Promise<Hex>;
  contractValue(address: Address, field: ContractField): Promise<unknown>;
}

export interface TestnetReceiptAnchor {
  transactionHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
}

function sameAddress(left: unknown, right: Address): boolean {
  return typeof left === "string" && getAddress(left) === getAddress(right);
}

function assertExactTransaction(
  actual: ChainTransaction,
  expected: { from: Address; to: Address | null; input: Hex; nonce: bigint },
) {
  const targetMatches = expected.to === null
    ? actual.to === null
    : actual.to !== null && sameAddress(actual.to, expected.to);
  if (!sameAddress(actual.from, expected.from) || !targetMatches ||
    actual.input !== expected.input || actual.nonce !== expected.nonce || actual.value !== 0n) {
    throw new Error("Deployment transaction does not match the plan");
  }
}

async function assertValue(
  reader: TestnetDeploymentReader,
  address: Address,
  field: ContractField,
  expected: Address | boolean,
  message: string,
) {
  const actual = await reader.contractValue(address, field);
  const matches = typeof expected === "boolean"
    ? actual === expected
    : sameAddress(actual, expected);
  if (!matches) throw new Error(message);
}

export async function verifyTestnetDeployment(input: {
  plan: DeploymentPlan;
  reader: TestnetDeploymentReader;
  receiptEvidence: {
    deployments: readonly TestnetReceiptAnchor[];
    pauseRegistry: TestnetReceiptAnchor;
  };
}) {
  const { plan, reader, receiptEvidence } = input;
  if (plan.chainId !== 1952 || plan.owner !== plan.deployer ||
    plan.proposalTransactions.length !== 1 ||
    plan.proposalTransactions[0]?.label !== "pause-registry" ||
    plan.activationTransactions.length !== 0) {
    throw new Error("Unsafe testnet deployment plan");
  }
  if (await reader.chainId() !== 1952) throw new Error("Testnet RPC chain mismatch");
  if (receiptEvidence.deployments.length !== plan.deployments.length) {
    throw new Error("Deployment receipt set is incomplete");
  }

  const contracts = [];
  for (const [index, deployment] of plan.deployments.entries()) {
    const anchor = receiptEvidence.deployments[index];
    const hash = anchor.transactionHash;
    const transaction = await reader.transaction(hash);
    assertExactTransaction(transaction, {
      from: plan.deployer,
      to: null,
      input: deployment.data,
      nonce: BigInt(deployment.nonce),
    });
    const receipt = await reader.receipt(hash);
    if (receipt.status !== "success" ||
      receipt.contractAddress === null ||
      !sameAddress(receipt.contractAddress, deployment.expectedContract)) {
      throw new Error("Deployment receipt does not match the plan");
    }
    if (receipt.blockNumber !== anchor.blockNumber || receipt.blockHash !== anchor.blockHash) {
      throw new Error("Supplied receipt anchor is not canonical");
    }
    if (await reader.blockHash(receipt.blockNumber) !== receipt.blockHash) {
      throw new Error("Receipt block is not canonical");
    }
    const code = await reader.code(deployment.expectedContract);
    if (code === "0x") throw new Error("Deployed contract has no runtime code");
    contracts.push({
      label: deployment.label,
      address: deployment.expectedContract,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      runtimeCodeHash: keccak256(code),
    });
  }

  const pause = plan.proposalTransactions[0];
  const pauseAnchor = receiptEvidence.pauseRegistry;
  const pauseTransaction = await reader.transaction(pauseAnchor.transactionHash);
  assertExactTransaction(pauseTransaction, {
    from: plan.owner,
    to: pause.to,
    input: pause.data,
    nonce: BigInt(plan.deployments.at(-1)!.nonce) + 1n,
  });
  const pauseReceipt = await reader.receipt(pauseAnchor.transactionHash);
  if (pauseReceipt.status !== "success" || pauseReceipt.contractAddress !== null) {
    throw new Error("Registry pause receipt is invalid");
  }
  if (pauseReceipt.blockNumber !== pauseAnchor.blockNumber ||
    pauseReceipt.blockHash !== pauseAnchor.blockHash) {
    throw new Error("Supplied receipt anchor is not canonical");
  }
  if (await reader.blockHash(pauseReceipt.blockNumber) !== pauseReceipt.blockHash) {
    throw new Error("Receipt block is not canonical");
  }

  await assertValue(reader, plan.registry, "owner", plan.owner, "Registry owner mismatch");
  await assertValue(reader, plan.registry, "paused", true, "Registry is not paused");
  await assertValue(reader, plan.riskManager, "owner", plan.owner, "Risk manager owner mismatch");
  await assertValue(reader, plan.riskManager, "paused", true, "Risk manager is not paused");
  await assertValue(
    reader, plan.riskManager, "executor", plan.executor,
    "Risk manager executor binding mismatch",
  );
  await assertValue(
    reader, plan.riskManager, "verifierSigner", plan.verifier,
    "Verifier signer binding mismatch",
  );
  await assertValue(reader, plan.executor, "registry", plan.registry, "Executor registry binding mismatch");
  await assertValue(
    reader, plan.executor, "riskManager", plan.riskManager,
    "Executor risk manager binding mismatch",
  );

  return {
    version: 1 as const,
    chainId: 1952 as const,
    deployer: plan.deployer,
    owner: plan.owner,
    verifier: plan.verifier,
    canaryWallet: plan.canaryWallet,
    contracts,
    pauseRegistryTransaction: pauseAnchor.transactionHash,
    pauseRegistryBlockNumber: pauseReceipt.blockNumber.toString(),
    pauseRegistryBlockHash: pauseReceipt.blockHash,
  };
}
