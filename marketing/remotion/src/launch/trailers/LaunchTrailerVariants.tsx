import { clockWipe } from "@remotion/transitions/clock-wipe";
import { flip } from "@remotion/transitions/flip";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { BlankChequeHookScene, EndScene, IntentScene, LimitsScene, NativeHookScene, PriorProofScene, ProofHookScene, SolverScene, WalletScene } from "./LaunchScenes";

const transition = linearTiming({ durationInFrames: 15 });
const longTransition = linearTiming({ durationInFrames: 18 });

export const NativeLaunchTrailer = () => <TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={100}><NativeHookScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={transition} />
  <TransitionSeries.Sequence durationInFrames={115}><IntentScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={transition} />
  <TransitionSeries.Sequence durationInFrames={115}><SolverScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={flip({ direction: "from-right", perspective: 1000 })} timing={transition} />
  <TransitionSeries.Sequence durationInFrames={125}><WalletScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={wipe({ direction: "from-top-right" })} timing={transition} />
  <TransitionSeries.Sequence durationInFrames={100}><EndScene line="Cobia verifies. Wallet decides." /></TransitionSeries.Sequence>
</TransitionSeries>;

export const NoBlankChequeTrailer = () => <TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={110}><BlankChequeHookScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={125}><LimitsScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={clockWipe({ width: 1920, height: 1080 })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={130}><WalletScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={105}><EndScene line="No keys given. No blind signing." /></TransitionSeries.Sequence>
</TransitionSeries>;

export const ProofLaunchTrailer = () => <TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={110}><ProofHookScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={clockWipe({ width: 1920, height: 1080 })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={135}><PriorProofScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={115}><IntentScene /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={flip({ direction: "from-bottom", perspective: 900 })} timing={longTransition} />
  <TransitionSeries.Sequence durationInFrames={105}><EndScene line="AI proposes. Cobia verifies." /></TransitionSeries.Sequence>
</TransitionSeries>;
