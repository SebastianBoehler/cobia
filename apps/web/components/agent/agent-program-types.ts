import type { Address, Hash } from "viem";

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
      stages?: { id: string; provider?: string; kind: string }[];
      balanceConstraints?: { kind: string; token: Address; atomic: string }[];
    }>;
    snapshot?: PublicArtifact<{ tokenEvidence?: TokenEvidence[] }>;
    evidence?: PublicArtifact<{
      balanceDeltas?: { token: Address; beforeAtomic: string; afterAtomic: string }[];
    }>;
    execution?: PublicArtifact<{
      program?: { actions?: { approvals?: Approval[] }[] };
    }>;
    verdict?: PublicArtifact<{ accepted: boolean; errorCodes: string[] }>;
    provenance?: PublicArtifact<{
      commandCount: number;
      fileCount: number;
      networkRequestCount: number;
    }>;
    replay?: PublicArtifact<{ reproduced?: boolean }>;
    receipt?: PublicArtifact<{ transactionHash?: Hash }>;
  };
}
