import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { IntentScene } from "./IntentScene";
import { ReceiptScene } from "./ReceiptScene";
import { SolverScene } from "./SolverScene";
import { VerificationScene } from "./VerificationScene";

const transition = linearTiming({ durationInFrames: 10 });

export const LandedProgramProofCut = () => (
  <>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150} name="Tagged intent composer">
        <IntentScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={180} name="Solver competition mechanism">
        <SolverScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom-left" })} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={145} name="Winning program execution">
        <VerificationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={125} name="Transaction receipt and balance">
        <ReceiptScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    <CobiaSoundDesign cues={[{ file: "slide.wav", frame: 136 }, { file: "orbit.wav", frame: 306 }, { file: "lift.wav", frame: 410 }, { file: "resolve.wav", frame: 442, volume: .7 }]} />
  </>
);
