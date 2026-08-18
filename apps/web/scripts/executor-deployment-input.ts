import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, type Abi, type Hex } from "viem";

interface ArtifactFile { abi: Abi; bytecode: { object: Hex } }

export function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

export function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

export function addressArgument(name: string) {
  const value = argument(name);
  if (!isAddress(value)) throw new Error(`Invalid --${name}`);
  return getAddress(value);
}

function artifact(name: string) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const value = JSON.parse(readFileSync(
    `${root}contracts/out/${name}.sol/${name}.json`,
    "utf8",
  )) as ArtifactFile;
  if (!value.bytecode.object.startsWith("0x") || value.bytecode.object.length < 4) {
    throw new Error(`${name} artifact is unavailable; run pnpm contracts:test first`);
  }
  return { abi: value.abi, bytecode: value.bytecode.object };
}

export function executorArtifacts() {
  return {
    registry: artifact("CobiaAdapterRegistry"),
    riskManager: artifact("CobiaRiskManagerV1"),
    executor: artifact("CobiaExecutorV2"),
  };
}
