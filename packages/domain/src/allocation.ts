export interface AtomicAllocationSplit {
  protocolAtomic: string;
  cashAtomic: string;
}

export interface BasisPointAllocation {
  candidateId: string;
  bps: number;
}

export interface AtomicAllocationRow extends BasisPointAllocation {
  amountAtomic: string;
}

export function splitAtomicAllocation(
  principalAtomic: string,
  protocolBps: number,
): AtomicAllocationSplit {
  const principal = BigInt(principalAtomic);
  const protocol = (principal * BigInt(protocolBps)) / 10_000n;
  return {
    protocolAtomic: protocol.toString(),
    cashAtomic: (principal - protocol).toString(),
  };
}

export function allocateAtomicByBps(
  principalAtomic: string,
  allocations: readonly BasisPointAllocation[],
): AtomicAllocationRow[] {
  const totalBps = allocations.reduce((total, allocation) => total + allocation.bps, 0);
  if (totalBps !== 10_000) throw new Error("Allocations must total 10000 basis points");

  const principal = BigInt(principalAtomic);
  const amounts = allocations.map(
    (allocation) => (principal * BigInt(allocation.bps)) / 10_000n,
  );
  const remainder = principal - amounts.reduce((total, amount) => total + amount, 0n);
  const cashIndex = allocations.findIndex(
    (allocation) => allocation.bps > 0 && allocation.candidateId.startsWith("cash:"),
  );
  const remainderIndex = cashIndex >= 0
    ? cashIndex
    : allocations.findIndex((allocation) => allocation.candidateId.startsWith("cash:"));
  if (remainder > 0n && remainderIndex < 0) {
    throw new Error("Atomic allocation remainder requires a cash candidate");
  }
  if (remainderIndex >= 0) amounts[remainderIndex] += remainder;

  return allocations.map((allocation, index) => ({
    ...allocation,
    amountAtomic: amounts[index].toString(),
  }));
}

export function atomicWeightedApyBps(
  protocolApyBps: number,
  protocolAtomic: string,
  principalAtomic: string,
): number {
  return Number(
    (BigInt(protocolApyBps) * BigInt(protocolAtomic)) /
      BigInt(principalAtomic),
  );
}
