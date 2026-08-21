import { Audio } from "@remotion/media";
import {
  AbsoluteFill, Easing, Interactive, interpolate, Sequence, staticFile,
  useCurrentFrame,
} from "remotion";
import { ArrowUpIcon } from "../shared/Stage";

const intent = "Swap 10 @USDG into at least 9.95 @USDt0 on @XLayer";
const tagFrames: Record<string, number> = { "@USDG": 58, "@USDt0": 117, "@XLayer": 142 };

const CheckIcon = () => (
  <svg aria-hidden="true" height="27" viewBox="0 0 24 24" width="27">
    <path d="m5.5 12.5 4 4 9-9" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
  </svg>
);

const AnimatedIntent = ({ text }: { readonly text: string }) => {
  const frame = useCurrentFrame();
  return text.split(/(@[A-Za-z0-9]+)/g).map((part, index) => {
    const resolvedAt = tagFrames[part];
    return resolvedAt ? (
      <span
        key={`${part}-${index}`}
        style={{
          backgroundColor: "rgba(55, 83, 255, 0.12)",
          borderRadius: 9,
          boxDecorationBreak: "clone",
          color: "#3650ee",
          display: "inline-block",
          fontWeight: 720,
          padding: "0 5px 2px",
          rotate: interpolate(frame, [resolvedAt - 2, resolvedAt + 5, resolvedAt + 13], ["0deg", "-2deg", "0deg"], {
            easing: [Easing.spring({ damping: 130 }), Easing.spring({ damping: 180 })],
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [resolvedAt - 2, resolvedAt + 5, resolvedAt + 14], [0.94, 1.14, 1], {
            easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 160 })],
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {part}
      </span>
    ) : part;
  });
};

export const BouncyPromptClip = () => {
  const frame = useCurrentFrame();
  const count = Math.floor(interpolate(frame, [28, 142], [0, intent.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const sent = frame >= 178;

  return (
    <AbsoluteFill style={{ alignItems: "center", backgroundColor: "#f5f7fb", color: "#11141a", display: "flex", justifyContent: "center", overflow: "hidden" }}>
      <Interactive.Div name="Ambient cobalt glow" style={{
        background: "radial-gradient(circle, rgba(55,83,255,.2) 0%, rgba(55,83,255,0) 68%)",
        borderRadius: "50%", height: 980, opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        position: "absolute", right: -180, top: -420, width: 980,
      }} />
      <div style={{ backgroundImage: "radial-gradient(#cfd5e4 1.5px, transparent 1.5px)", backgroundSize: "34px 34px", inset: 0, opacity: 0.28, position: "absolute" }} />

      <Interactive.Div name="Bouncy intent prompt" style={{
        backgroundColor: "white",
        border: "1px solid #d8dce5",
        borderRadius: 30,
        boxShadow: "0 32px 90px rgba(17,20,26,.15)",
        display: "flex",
        flexDirection: "column",
        height: 430,
        justifyContent: "space-between",
        opacity: interpolate(frame, [0, 12, 215, 229], [0, 1, 1, 0], { easing: [Easing.bezier(0.16, 1, 0.3, 1), Easing.linear, Easing.bezier(0.7, 0, 0.84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        padding: "42px 44px 34px",
        scale: interpolate(frame, [0, 15, 28], [0.84, 1.045, 1], { easing: [Easing.spring({ damping: 105 }), Easing.spring({ damping: 150 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
        translate: interpolate(frame, [0, 15, 28, 164, 173, 184], ["0px 70px", "0px -13px", "0px 0px", "0px 0px", "0px -11px", "0px 0px"], { easing: [Easing.spring({ damping: 110 }), Easing.spring({ damping: 160 }), Easing.linear, Easing.spring({ damping: 120 }), Easing.spring({ damping: 170 })], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        width: 1320,
      }}>
        <Interactive.Div name="Typed intent" style={{ fontSize: 46, fontWeight: count ? 580 : 430, letterSpacing: "-.025em", lineHeight: 1.35, minHeight: 190 }}>
          {count ? <AnimatedIntent text={intent.slice(0, count)} /> : <span style={{ color: "#747b89" }}>Ask Cobia to do something onchain…</span>}
          {frame >= 24 && frame < 160 ? <span style={{ color: "#3753ff", opacity: frame % 16 < 8 ? 1 : 0 }}>│</span> : null}
        </Interactive.Div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {["Any action", "@ Mention", "Routes"].map((item) => (
              <span key={item} style={{ background: "#f1f3f7", borderRadius: 999, color: "#20242d", fontSize: 18, padding: "11px 18px" }}>{item}</span>
            ))}
          </div>
          <Interactive.Div name="Send intent" style={{
            alignItems: "center", backgroundColor: sent ? "#3753ff" : frame >= 146 ? "#11141a" : "#b4b7bd",
            borderRadius: "50%", boxShadow: sent ? "0 0 0 12px rgba(55,83,255,.12)" : "0 0 0 0 rgba(55,83,255,0)",
            display: "flex", height: 62, justifyContent: "center", overflow: "hidden", position: "relative",
            scale: interpolate(frame, [158, 168, 176, 188], [1, 1.1, 0.82, 1], { easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 110 }), Easing.spring({ damping: 150 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
            width: 62,
          }}>
            <div style={{ opacity: interpolate(frame, [168, 178], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [168, 178], ["0px 0px", "0px -32px"], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <ArrowUpIcon size={29} />
            </div>
            <div style={{ opacity: interpolate(frame, [177, 187], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), position: "absolute", scale: interpolate(frame, [177, 190], [0.65, 1], { easing: Easing.spring({ damping: 140 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}>
              <CheckIcon />
            </div>
          </Interactive.Div>
        </div>
      </Interactive.Div>

      {[58, 117, 142].map((from, index) => (
        <Sequence from={from} key={from} layout="none">
          <Audio src={staticFile(`sfx/tag-chime-${index + 1}.wav`)} volume={0.86} />
        </Sequence>
      ))}
      <Sequence from={170} layout="none">
        <Audio src={staticFile("sfx/send-chord.wav")} volume={0.72} />
      </Sequence>
    </AbsoluteFill>
  );
};
