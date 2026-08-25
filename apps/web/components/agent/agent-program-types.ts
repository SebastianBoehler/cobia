import type { Address, Hash, Hex } from "viem";

interface TokenEvidence {
  token: Address;
  symbol: string;
  decimals: number;
}

interface TokenAmount {
  token: Address;
  atomic: string;
}

interface Approval {
  token: Address;
  amount: string;
}

interface ProgramAction {
  capabilityId: string;
  capabilityVersion: number;
  parameters?: {
    tokenIn?: Address;
    tokenOut?: Address;
    amountInAtomic?: string;
    minimumOutputAtomic?: string;
  };
}

export interface PublicArtifact<T> {
  artifactHash?: Hash;
  payload?: T;
  summary?: T;
}

export interface ProgramView {
  submission: {
    id: string;
    solverId: string;
    revision: number;
    programHash: Hash;
    state: string;
    executable: boolean;
    owner: Address | null;
    validUntil: string;
    blockNumber: string;
    blockHash: Hash;
    displayGoal: string | null;
    failureCodes: string[];
  };
  artifacts: {
    program?: PublicArtifact<{
      input?: TokenAmount;
      actions?: ProgramAction[];
      stages?: { id: string; provider?: string; kind: string; chainId?: 1 | 196 | 8453 }[];
      balanceConstraints?: { kind: string; token: Address; atomic: string }[];
    }>;
    snapshot?: PublicArtifact<{ tokenEvidence?: TokenEvidence[] }>;
    evidence?: PublicArtifact<{
      balanceDeltas?: { token: Address; beforeAtomic: string; afterAtomic: string }[];
      simulations?: { assetDeltas: { token: Address; account: Address;
        beforeAtomic: string; afterAtomic: string }[] }[];
    }>;
    execution?: PublicArtifact<{
      program?: { actions?: { approvals?: Approval[] }[] };
      version?: number;
      kind?: string;
      programId?: Hash;
      owner?: Address;
      deadline?: number;
      finalOutput?: { chainId: 1 | 196; token: Address; minimumAtomic: string };
      stages?: Array<{
        stageId: string; ordinal?: number; chainId: 1 | 196 | 8453;
        calls?: { to: Address; data: Hex; value: Hex }[];
        predecessorStageId?: Hash | null; inputToken?: Address; requiredConfirmations?: number;
        transaction?: { chainId: 1 | 196; from: Address; to: Address; nonce: string; value: Hex; data: Hex };
        delivery?: { kind: "none" } | { kind: "bridge"; destinationChainId: 1 | 196;
          recipient: Address; token: Address; minimumAtomic: string };
        evidenceHash?: Hash;
      }>;
    }>;
    verdict?: PublicArtifact<{ accepted: boolean; errorCodes: string[] }>;
    provenance?: PublicArtifact<{
      commandCount: number;
      fileCount: number;
      networkRequestCount: number;
    }>;
    replay?: PublicArtifact<{ reproduced?: boolean }>;
    receipt?: PublicArtifact<{
      transactionHash?: Hash;
      blockNumber?: string;
      balanceChanges?: { token: Address; beforeAtomic: string; afterAtomic: string }[];
    }>;
  };
}
