import { clockWipe } from "@remotion/transitions/clock-wipe";
import { flip } from "@remotion/transitions/flip";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { BetterRouteHook, CompetitionBoard, PublicRecord, ReputationHook, SearchFreelyHook, SolverBoundary, SolverEnd } from "./SolverScenes";
import { SolverSoundDesign } from "./SolverSoundDesign";

const quick = linearTiming({ durationInFrames: 16 });
const deliberate = linearTiming({ durationInFrames: 18 });

export const BetterRouteSolverTrailer = () => <>
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={100}><BetterRouteHook /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={quick} />
    <TransitionSeries.Sequence durationInFrames={135}><CompetitionBoard /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={deliberate} />
    <TransitionSeries.Sequence durationInFrames={105}><SolverEnd line="Best verified outcome wins." /></TransitionSeries.Sequence>
  </TransitionSeries>
  <SolverSoundDesign variant="better-route" />
</>;

export const NoKeysSolverTrailer = () => <>
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={105}><SearchFreelyHook /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={clockWipe({ width: 1920, height: 1080 })} timing={quick} />
    <TransitionSeries.Sequence durationInFrames={145}><SolverBoundary /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={deliberate} />
    <TransitionSeries.Sequence durationInFrames={105}><SolverEnd line="Your code proposes. The owner signs." /></TransitionSeries.Sequence>
  </TransitionSeries>
  <SolverSoundDesign variant="no-keys" />
</>;

export const SolverReputationTrailer = () => <>
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={100}><ReputationHook /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={flip({ direction: "from-right", perspective: 1000 })} timing={quick} />
    <TransitionSeries.Sequence durationInFrames={145}><PublicRecord /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({ direction: "from-top-right" })} timing={deliberate} />
    <TransitionSeries.Sequence durationInFrames={105}><SolverEnd line="Build a record. Win verified intents." /></TransitionSeries.Sequence>
  </TransitionSeries>
  <SolverSoundDesign variant="reputation" />
</>;
