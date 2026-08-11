import type {
  ConfirmedOwnerTransactionV2,
  ExecutionResumeCheckpointV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import type { MachineBatchResultV2 } from "./execution-machine-types";

interface SwapReservationV2 {
  source: ExecutionResumeCheckpointV2;
  token: object;
  outputDeltaAtomic: bigint;
}

export class SwapCapabilityStoreV2 {
  private readonly confirmedSources = new WeakMap<
    ConfirmedOwnerTransactionV2,
    ExecutionResumeCheckpointV2
  >();
  private readonly consumedSources = new WeakSet<ExecutionResumeCheckpointV2>();
  private readonly activeReservations = new WeakMap<ExecutionResumeCheckpointV2, object>();
  private readonly resumeReservations = new WeakMap<
    ExecutionResumeCheckpointV2,
    SwapReservationV2
  >();

  register(
    confirmed: ConfirmedOwnerTransactionV2,
    source: ExecutionResumeCheckpointV2,
  ): void {
    this.confirmedSources.set(confirmed, source);
  }

  begin(
    confirmed: ConfirmedOwnerTransactionV2,
    assertSource: (source: ExecutionResumeCheckpointV2) => void,
  ): SwapReservationV2 {
    const source = this.confirmedSources.get(confirmed);
    if (!source) throw new Error("Post-swap execution requires a confirmed swap capability");
    if (confirmed.stateCheck.kind !== "swap") {
      throw new Error("Post-swap capability does not contain swap evidence");
    }
    if (this.consumedSources.has(source)) {
      throw new Error("Confirmed swap capability was already consumed");
    }
    if (this.activeReservations.has(source)) {
      throw new Error("Confirmed swap capability is already in flight");
    }
    assertSource(source);
    const reservation = {
      source,
      token: Object.freeze({}),
      outputDeltaAtomic: confirmed.stateCheck.outputDeltaAtomic,
    };
    this.activeReservations.set(source, reservation.token);
    return reservation;
  }

  release(reservation: SwapReservationV2): void {
    if (this.isActive(reservation)) this.activeReservations.delete(reservation.source);
  }

  settleBatch(reservation: SwapReservationV2, result: MachineBatchResultV2): void {
    if (result.kind === "complete" || result.submitted?.label === "aave-v3-supply" ||
      result.submitted?.label === "uniswap-v3-full-range-mint") {
      this.consume(reservation);
    } else if (result.resume && (result.kind === "pending" ||
      result.failure.code !== "transaction-reverted")) {
      this.resumeReservations.set(result.resume, reservation);
    } else {
      this.release(reservation);
    }
  }

  settleResume(
    checkpoint: ExecutionResumeCheckpointV2,
    result: SubmittedResumeResultV2,
  ): void {
    const reservation = this.resumeReservations.get(checkpoint);
    if (!reservation || result.status === "pending" ||
      (result.status === "failed" && result.failure.code !== "transaction-reverted")) return;
    this.resumeReservations.delete(checkpoint);
    if (result.status === "confirmed" || result.failure.code === "transaction-reverted") {
      this.release(reservation);
    }
  }

  private consume(reservation: SwapReservationV2): void {
    if (this.isActive(reservation)) {
      this.activeReservations.delete(reservation.source);
      this.consumedSources.add(reservation.source);
    }
  }

  private isActive(reservation: SwapReservationV2): boolean {
    return this.activeReservations.get(reservation.source) === reservation.token;
  }
}
