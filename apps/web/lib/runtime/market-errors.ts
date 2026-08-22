export class OwnerBalanceRequiredError extends Error {
  constructor() {
    super("Intent owner has no native execution balance");
  }
}

export class IntentSnapshotUnavailableError extends Error {
  constructor() {
    super("Intent snapshot could not be captured");
  }
}
