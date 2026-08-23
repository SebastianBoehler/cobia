export type StageStateV4 =
  | "pending"
  | "prepared"
  | "broadcasting"
  | "submitted"
  | "finalized"
  | "delivered"
  | "confirmed"
  | "reconciliation_required"
  | "failed";

export type StageEventV4 =
  | "prepare"
  | "arm"
  | "submit"
  | "finalize"
  | "record_delivery"
  | "confirm"
  | "require_reconciliation"
  | "fail";

export class StageTransitionErrorV4 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageTransitionErrorV4";
  }
}

function predecessorReady(state: StageStateV4 | null | undefined): boolean {
  return state === undefined || state === null || state === "delivered" || state === "confirmed";
}

export function nextStageStateV4(input: {
  state: StageStateV4;
  event: StageEventV4;
  predecessorState?: StageStateV4 | null;
  deliveryKind?: "none" | "bridge";
}): StageStateV4 {
  if (input.state === "reconciliation_required") {
    throw new StageTransitionErrorV4("Stage requires manual reconciliation");
  }
  if (input.state === "confirmed" || input.state === "failed") {
    throw new StageTransitionErrorV4("Stage is already resolved");
  }
  if (input.event === "require_reconciliation") return "reconciliation_required";
  if (input.event === "fail") {
    if (input.state !== "pending" && input.state !== "prepared") {
      throw new StageTransitionErrorV4("A broadcast stage requires manual reconciliation");
    }
    return "failed";
  }
  if ((input.event === "prepare" || input.event === "arm") &&
      !predecessorReady(input.predecessorState)) {
    throw new StageTransitionErrorV4("Stage predecessor is not delivered");
  }

  if (input.state === "pending" && input.event === "prepare") return "prepared";
  if (input.state === "prepared" && input.event === "arm") return "broadcasting";
  if (input.state === "prepared" && input.event === "submit") {
    throw new StageTransitionErrorV4("Stage must be armed before submission");
  }
  if (input.state === "broadcasting" && input.event === "submit") return "submitted";
  if (input.state === "submitted" && input.event === "finalize") return "finalized";
  if (input.event === "record_delivery" && input.state !== "finalized") {
    throw new StageTransitionErrorV4("Bridge receipt must be finalized before delivery");
  }
  if (input.state === "finalized" && input.event === "record_delivery") {
    if (input.deliveryKind !== "bridge") {
      throw new StageTransitionErrorV4("Stage has no bridge delivery");
    }
    return "delivered";
  }
  if (input.state === "finalized" && input.event === "confirm") {
    if (input.deliveryKind !== "none") {
      throw new StageTransitionErrorV4("Bridge stage requires delivery evidence");
    }
    return "confirmed";
  }
  throw new StageTransitionErrorV4(`Invalid ${input.state} to ${input.event} transition`);
}
