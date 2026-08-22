import { keccak256, type Address, type Hash, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  verifyMainnetV3State,
  type MainnetV3StateReader,
  type MainnetV3StateSpec,
} from "./mainnet-v3-state-verifier";

const hash = (digit: string) => `0x${digit.repeat(64)}` as Hash;
const safe = "0x1111111111111111111111111111111111111111" as Address;
const verifier = "0x2222222222222222222222222222222222222222" as Address;
const registry = "0x3333333333333333333333333333333333333333" as Address;
const risk = "0x4444444444444444444444444444444444444444" as Address;
const executor = "0x5555555555555555555555555555555555555555" as Address;
const canary = "0x6666666666666666666666666666666666666666" as Address;
const token = "0x7777777777777777777777777777777777777777" as Address;
const target = "0x8888888888888888888888888888888888888888" as Address;
const activationAtSec = 2_000_000_000;
const limits = { maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n };

function fixture() {
  const codes = new Map<Address, Hex>([
    [risk, "0x6001"], [executor, "0x6002"], [target, "0x6003"],
  ]);
  const spec: MainnetV3StateSpec = {
    chainId: 196,
    owner: safe,
    verifier,
    registry,
    riskManager: risk,
    executor,
    canary,
    activationAtSec,
    openAccessAfterSec: 0,
    codeHashes: {
      riskManager: keccak256(codes.get(risk)!), executor: keccak256(codes.get(executor)!),
    },
    tokens: [{ token, limits }],
    permissions: [{
      key: hash("c"), target, runtimeCodeHash: keccak256(codes.get(target)!),
      activateAfterSec: 1_999_000_000,
    }],
  };
  const values = new Map<string, unknown>([
    [`${risk}:owner`, safe], [`${risk}:verifierSigner`, verifier],
    [`${risk}:executor`, executor], [`${risk}:paused`, true],
    [`${risk}:accessMode`, 0], [`${risk}:pendingVerifier`, "0x0000000000000000000000000000000000000000"],
    [`${risk}:verifierActivateAfter`, 0n], [`${risk}:openAccessAfter`, 0n],
    [`${risk}:pendingToken:${token}`, { limits, activateAfter: BigInt(activationAtSec) }],
    [`${risk}:tokenEnabled:${token}`, false],
    [`${risk}:tokenLimits:${token}`, { maxRoute: 0n, maxWalletDaily: 0n, maxCumulative: 0n }],
    [`${risk}:walletAllowAfter:${canary}`, BigInt(activationAtSec)],
    [`${risk}:walletAllowed:${canary}`, false], [`${risk}:walletDenied:${canary}`, false],
    [`${risk}:unpauseAfter`, BigInt(activationAtSec)],
    [`${registry}:paused`, true],
    [`${registry}:permissions:${hash("c")}`, {
      runtimeCodeHash: keccak256(codes.get(target)!), target, activateAfter: 1_999_000_000n, active: false,
    }],
    [`${executor}:registry`, registry], [`${executor}:riskManager`, risk],
  ]);
  const reader: MainnetV3StateReader = {
    chainId: async () => 196,
    latestBlock: async () => ({ number: 123n, hash: hash("1"), timestamp: 1_999_900_000n }),
    blockHash: async () => hash("1"),
    code: async (address) => codes.get(address) ?? "0x",
    contractValue: async (address, field, args = []) =>
      values.get(`${address}:${field}${args.length ? `:${String(args[0])}` : ""}`),
  };
  return { spec, reader, values, codes };
}

function activate(value: ReturnType<typeof fixture>) {
  value.values.set(`${risk}:paused`, false);
  value.values.set(`${registry}:paused`, false);
  value.values.set(`${risk}:pendingToken:${token}`, {
    limits: { maxRoute: 0n, maxWalletDaily: 0n, maxCumulative: 0n }, activateAfter: 0n,
  });
  value.values.set(`${risk}:tokenEnabled:${token}`, true);
  value.values.set(`${risk}:tokenLimits:${token}`, limits);
  value.values.set(`${risk}:walletAllowAfter:${canary}`, 0n);
  value.values.set(`${risk}:walletAllowed:${canary}`, true);
  value.values.set(`${risk}:unpauseAfter`, 0n);
  value.values.set(`${registry}:permissions:${hash("c")}`, {
    runtimeCodeHash: keccak256(value.codes.get(target)!), target, activateAfter: 1_999_000_000n, active: true,
  });
}

describe("mainnet V3 state verifier", () => {
  it("accepts the exact pinned pre-activation state", async () => {
    const value = fixture();
    const evidence = await verifyMainnetV3State({ ...value, mode: "proposed" });
    expect(evidence).toMatchObject({ mode: "proposed", chainId: 196, blockNumber: "123" });
  });

  it("accepts the exact activated state", async () => {
    const value = fixture();
    activate(value);
    const evidence = await verifyMainnetV3State({ ...value, mode: "active" });
    expect(evidence).toMatchObject({ mode: "active", chainId: 196, blockHash: hash("1") });
  });

  it("accepts only the scheduled public-access transition pinned by the release spec", async () => {
    const value = fixture();
    Object.assign(value.spec, { openAccessAfterSec: 2_000_100_000 });
    value.values.set(`${risk}:openAccessAfter`, 2_000_100_000n);

    await expect(verifyMainnetV3State({ ...value, mode: "proposed" }))
      .resolves.toMatchObject({ mode: "proposed" });

    value.values.set(`${risk}:openAccessAfter`, 2_000_100_001n);
    await expect(verifyMainnetV3State({ ...value, mode: "proposed" }))
      .rejects.toThrow("open-access proposal mismatch");
  });

  it.each([
    ["chain mismatch", (value: ReturnType<typeof fixture>) => { value.reader.chainId = async () => 1952; }, "chain mismatch"],
    ["reorg", (value: ReturnType<typeof fixture>) => { value.reader.blockHash = async () => hash("f"); }, "not canonical"],
    ["limit expansion", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${risk}:pendingToken:${token}`, { limits: { ...limits, maxRoute: 11n }, activateAfter: BigInt(activationAtSec) });
    }, "token proposal mismatch"],
    ["canary replacement", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${risk}:walletAllowAfter:${canary}`, 0n);
    }, "canary proposal mismatch"],
    ["unpause replacement", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${risk}:unpauseAfter`, 123n);
    }, "unpause proposal mismatch"],
    ["unexpected activation", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${risk}:tokenEnabled:${token}`, true);
    }, "token activation mismatch"],
    ["risk code change", (value: ReturnType<typeof fixture>) => {
      value.codes.set(risk, "0x60ff");
    }, "risk manager code hash mismatch"],
    ["permission target change", (value: ReturnType<typeof fixture>) => {
      value.values.set(`${registry}:permissions:${hash("c")}`, {
        runtimeCodeHash: keccak256(value.codes.get(target)!), target: canary, activateAfter: 1_999_000_000n, active: false,
      });
    }, "permission mismatch"],
  ])("rejects %s", async (_name, mutate, message) => {
    const value = fixture();
    mutate(value);
    await expect(verifyMainnetV3State({ ...value, mode: "proposed" })).rejects.toThrow(message);
  });
});
