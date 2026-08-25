import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProgramView } from "./agent-program-types";
import { AgentProgramDetails } from "./AgentProgramDetails";

const owner = "0x1111111111111111111111111111111111111111" as const;

describe("AgentProgramDetails", () => {
  it("shows canonical verifier evidence and wallet-batch calls as accepted", () => {
    const program: ProgramView = {
      submission: { id: "550e8400-e29b-41d4-a716-446655440000", solverId: "cobia-agentic",
        revision: 1, programHash: `0x${"11".repeat(32)}`, state: "executed", executable: false,
        owner, validUntil: "2033-05-18T03:35:00Z", blockNumber: "123",
        blockHash: `0x${"22".repeat(32)}`, displayGoal: "Swap OKB", failureCodes: [] },
      artifacts: {
        program: { payload: { stages: [{ id: "swap", kind: "wallet-transaction",
          provider: "okx.dex@1", chainId: 196 }] } },
        evidence: { payload: { simulations: [{ assetDeltas: [{
          token: "0x2222222222222222222222222222222222222222", account: owner,
          beforeAtomic: "0", afterAtomic: "1171695",
        }] }] } },
        verdict: { payload: { accepted: true, errorCodes: [] } },
        execution: { payload: { version: 1, kind: "wallet-call-batch", stages: [{
          stageId: "swap", chainId: 196, calls: [{
            to: "0x3333333333333333333333333333333333333333", data: "0x1234", value: "0x0",
          }],
        }] } },
      },
    };

    const html = renderToStaticMarkup(<AgentProgramDetails program={program}
      tokenLabel={(token) => token} tokenDecimals={() => 6} />);

    expect(html).toContain("Replay reproduced the signed outcome");
    expect(html).toContain("The verifier replay reproduced the signed outcome before execution.");
    expect(html).toContain("okx.dex@1 wallet call");
    expect(html).toContain("0x3333…3333 · chain 196");
    expect(html).not.toContain("Replay was not accepted");
    expect(html).not.toContain("No public wallet calls were recorded");
  });
});
