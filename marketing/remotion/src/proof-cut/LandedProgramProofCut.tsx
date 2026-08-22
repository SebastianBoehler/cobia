import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Sequence, staticFile } from "remotion";
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
      <TransitionSeries.Transition presentation={fade()} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={180} name="Solver competition mechanism">
        <SolverScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={145} name="Winning program execution">
        <VerificationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transition} />
      <TransitionSeries.Sequence durationInFrames={125} name="Transaction receipt and balance">
        <ReceiptScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    {[45, 92, 128].map((from) => <Sequence from={from} key={from} layout="none"><Audio playbackRate={1.4} src={staticFile("sfx/tag-chime-2.wav")} toneFrequency={1.08} volume={.28} /></Sequence>)}
    <Sequence from={137} layout="none"><Audio playbackRate={1.08} src={staticFile("sfx/send-chord.wav")} toneFrequency={1.04} volume={.34} /></Sequence>
    <Sequence from={232} layout="none"><Audio playbackRate={1.18} src={staticFile("sfx/send-confirm.wav")} toneFrequency={.84} volume={.22} /></Sequence>
    <Sequence from={286} layout="none"><Audio playbackRate={1.3} src={staticFile("sfx/tag-chime-2.wav")} toneFrequency={1.08} volume={.3} /></Sequence>
    <Sequence from={416} layout="none"><Audio playbackRate={1.08} src={staticFile("sfx/send-chord.wav")} toneFrequency={1.02} volume={.3} /></Sequence>
    <Sequence from={472} layout="none"><Audio playbackRate={1.1} src={staticFile("sfx/send-confirm.wav")} toneFrequency={1.1} volume={.36} /></Sequence>
  </>
);
