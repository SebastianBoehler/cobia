import { readOkxCredentials } from "../apps/web/lib/env";
import { createOkxClient } from "../apps/web/lib/okx/client";

interface CliOptions {
  chain: "196";
  token: string;
  protocol: string;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseOptions(): CliOptions {
  const chain = readOption("chain") ?? "196";
  if (chain !== "196") throw new Error("Cobia supports only X Layer chain 196");
  return {
    chain,
    token: readOption("token") ?? "USDC",
    protocol: readOption("protocol") ?? "AAVE V3",
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const client = createOkxClient({ credentials: readOkxCredentials() });
  const products = await client.searchProducts({
    tokenKeywordList: [options.token],
    platformKeywordList: [options.protocol],
    chainIndex: options.chain,
    productGroup: "LENDING",
    pageNum: 1,
  });
  const matching = products.filter(
    (product) =>
      product.chainIndex === options.chain &&
      product.platformName.toLowerCase() === options.protocol.toLowerCase(),
  );

  if (matching.length === 0) {
    throw new Error(
      `No ${options.protocol} ${options.token} product returned for X Layer`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      matching.map((product) => ({
        investmentId: product.investmentId,
        asset: product.name,
        platform: product.platformName,
        chainIndex: product.chainIndex,
        rate: product.rate,
        tvlUsd: product.tvl,
        retrievedAt: new Date().toISOString(),
      })),
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown live gate failure";
  process.stderr.write(`OKX live gate failed: ${message}\n`);
  process.exitCode = 1;
});
