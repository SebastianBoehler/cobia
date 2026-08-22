import { privateKeyToAccount } from "viem/accounts";
import { assertAgentExecutorReadyV1, createAgentExecutorReadV1 } from
  "../coding-agent-sandbox/executor-preflight";
import { verifyCompositionProposalV1 } from "../open-exchange/composition-verifier";
import { replayCapabilityRemotely } from "../replay/remote-client";

type VerificationInput = Parameters<typeof verifyCompositionProposalV1>[0];
type Client = Parameters<typeof verifyCompositionProposalV1>[1]["client"];
type Verifier = Pick<ReturnType<typeof privateKeyToAccount>, "address" | "signTypedData">;

interface Dependencies {
  client: Client;
  config: {
    COBIA_EXECUTOR_V3_ADDRESS: `0x${string}`;
    COBIA_EXECUTOR_V3_CODE_HASH: `0x${string}`;
  };
  verifier: Verifier;
}

export function verifyRuntimeCompositionProposal(
  input: VerificationInput,
  { client, config, verifier }: Dependencies,
) {
  return verifyCompositionProposalV1(input, {
    client,
    executor: config.COBIA_EXECUTOR_V3_ADDRESS,
    attestor: verifier.address,
    assertReady: ({ owner, inputToken, inputAmount }) => assertAgentExecutorReadyV1({
      executor: config.COBIA_EXECUTOR_V3_ADDRESS,
      expectedCodeHash: config.COBIA_EXECUTOR_V3_CODE_HASH,
      expectedVerifier: verifier.address,
      owner, inputToken, inputAmount,
      read: createAgentExecutorReadV1(client),
    }),
    async replay(replayInput) {
      return replayCapabilityRemotely({ blockNumber: replayInput.blockNumber,
        program: replayInput.program, compiled: replayInput.compiled });
    },
    signTypedData: (typedData) => verifier.signTypedData(typedData),
  });
}
