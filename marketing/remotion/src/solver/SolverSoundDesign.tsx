import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

type Variant = "better-route" | "no-keys" | "reputation";

const Cue = ({ file, frame, volume }: { readonly file: string; readonly frame: number; readonly volume: number }) => (
  <Sequence from={frame} layout="none">
    <Audio src={staticFile(`sfx/solver-air/${file}`)} volume={volume} />
  </Sequence>
);

const score: Record<Variant, { readonly lift: number; readonly resolve: number; readonly transitions: readonly [{ readonly file: "orbit.wav" | "slide.wav"; readonly frame: number }, { readonly file: "orbit.wav" | "slide.wav"; readonly frame: number }] }> = {
  "better-route": { lift: 108, resolve: 216, transitions: [{ file: "slide.wav", frame: 72 }, { file: "slide.wav", frame: 189 }] },
  "no-keys": { lift: 113, resolve: 232, transitions: [{ file: "orbit.wav", frame: 76 }, { file: "slide.wav", frame: 204 }] },
  reputation: { lift: 103, resolve: 227, transitions: [{ file: "orbit.wav", frame: 71 }, { file: "slide.wav", frame: 199 }] },
};

export const SolverSoundDesign = ({ variant }: { readonly variant: Variant }) => {
  const timing = score[variant];
  return <>
    <Audio src={staticFile("sfx/solver-air/bed.wav")} volume={.95} />
    <Cue file={timing.transitions[0].file} frame={timing.transitions[0].frame} volume={timing.transitions[0].file === "orbit.wav" ? .62 : .82} />
    <Cue file="lift.wav" frame={timing.lift} volume={.78} />
    <Cue file={timing.transitions[1].file} frame={timing.transitions[1].frame} volume={.78} />
    <Cue file="resolve.wav" frame={timing.resolve} volume={.9} />
  </>;
};
