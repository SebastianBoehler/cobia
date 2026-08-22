export class OwnerBalanceRequiredError extends Error {
  constructor() {
    super("Intent owner has no native execution balance");
  }
}
