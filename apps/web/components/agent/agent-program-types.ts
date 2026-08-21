import type { Address, Hash } from "viem";

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
      actions?: { capabilityId: string; capabilityVersion: number }[];
      stages?: { id: string; provider?: string; kind: string }[];
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
