export function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}
