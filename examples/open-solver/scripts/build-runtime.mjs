import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = new URL("../", import.meta.url);
const workspaceSource = (path) => fileURLToPath(new URL(`../../../packages/${path}/src/index.ts`, import.meta.url));
const alias = {
  "@cobia/domain": workspaceSource("domain"),
  "@cobia/solver-sdk": workspaceSource("solver-sdk"),
  "@cobia/solvers": workspaceSource("solvers"),
};
const external = [
  "@modelcontextprotocol/server",
  "@modelcontextprotocol/server/*",
  "viem",
  "viem/*",
  "zod",
  "smol-toml",
];

await mkdir(new URL("dist", packageRoot), { recursive: true });
await Promise.all([
  build({
    entryPoints: [fileURLToPath(new URL("src/index.ts", packageRoot))],
    outfile: fileURLToPath(new URL("dist/index.mjs", packageRoot)),
    bundle: true,
    platform: "node",
    format: "esm",
    alias,
    external: [...external, "@openai/codex-sdk"],
  }),
  build({
    entryPoints: [fileURLToPath(new URL("src/route-mcp-server.ts", packageRoot))],
    outfile: fileURLToPath(new URL("dist/route-mcp-server.mjs", packageRoot)),
    bundle: true,
    platform: "node",
    format: "esm",
    alias,
    external,
  }),
]);
