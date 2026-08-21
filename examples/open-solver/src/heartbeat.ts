import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeHeartbeat(statePath: string, at = new Date()) {
  const directory = dirname(statePath);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "heartbeat"), `${at.toISOString()}\n`, { mode: 0o600 });
}
