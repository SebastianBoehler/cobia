import { createSolverExchangeClient, runSolverCycle } from "@cobia/solver-sdk";
import { solve } from "./strategy";

const baseUrl = process.env.COBIA_EXCHANGE_URL ?? "https://getcobia.com";
const results = await runSolverCycle({
  client: createSolverExchangeClient({ baseUrl }),
  solve,
});

for (const result of results) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
