import { Audio } from "@remotion/media";
import {
  AbsoluteFill, Easing, Interactive, interpolate, Sequence, staticFile,
  useCurrentFrame,
} from "remotion";
import { ArrowUpIcon } from "../shared/Stage";

const prompt = "Swap 1 @WETH for the best verified X Layer route";
const address = "0x5a77f1443d16ee5761d310e38b62f77f726bc71c";

const Check = ({ color = "white", size = 23 }: { readonly color?: string; readonly size?: number }) => <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}><path d="m5.5 12.5 4 4 9-9" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" /></svg>;

const WethTag = ({ selected }: { readonly selected: boolean }) => <span style={{
  background: selected ? "rgba(55,83,255,.15)" : "rgba(55,83,255,.08)",
  border: selected ? "1px solid rgba(55,83,255,.28)" : "1px solid transparent",
  borderRadius: 10, color: "#3650ee", display: "inline-block", fontWeight: 740,
  padding: "1px 7px 3px",
}}>@WETH</span>;

export const TokenEvidenceClip = () => {
  const frame = useCurrentFrame();
  const typedLength = Math.floor(interpolate(frame, [18, 54, 145, 210], [0, 12, 12, prompt.length], {
    easing: [Easing.bezier(.3, 0, .2, 1), Easing.linear, Easing.bezier(.3, 0, .2, 1)],
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }));
  const typed = prompt.slice(0, typedLength);
  const tagStart = typed.indexOf("@WETH");
  const beforeTag = tagStart >= 0 ? typed.slice(0, tagStart) : typed;
  const afterTag = tagStart >= 0 ? typed.slice(tagStart + 5) : "";
  const tagComplete = typed.includes("@WETH");
  const selected = frame >= 146;
  const sent = frame >= 238;

  return <AbsoluteFill style={{ alignItems: "center", background: "#f5f7fb", color: "#11141a", display: "flex", fontFamily: "Inter, Arial, sans-serif", justifyContent: "center", overflow: "hidden" }}>
    <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.19), transparent 68%)", height: 980, position: "absolute", right: -180, top: -420, width: 980 }} />
    <div style={{ backgroundImage: "radial-gradient(#cfd5e4 1.5px, transparent 1.5px)", backgroundSize: "34px 34px", inset: 0, opacity: .28, position: "absolute" }} />

    <Interactive.Div name="Intent prompt" style={{
      background: "white", border: "1px solid #d8dce5", borderRadius: 30,
      boxShadow: "0 32px 90px rgba(17,20,26,.15)", display: "flex", flexDirection: "column",
      height: 350, justifyContent: "space-between",
      opacity: interpolate(frame, [0, 12, 282, 298], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      padding: "40px 44px 32px", position: "relative",
      scale: interpolate(frame, [0, 15, 28], [.86, 1.04, 1], { easing: [Easing.spring({ damping: 105 }), Easing.spring({ damping: 155 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
      translate: interpolate(frame, [0, 15, 28, 224, 238, 252], ["0px 64px", "0px -12px", "0px 0px", "0px 0px", "0px -9px", "0px 0px"], { easing: [Easing.spring({ damping: 110 }), Easing.spring({ damping: 160 }), Easing.linear, Easing.spring({ damping: 125 }), Easing.spring({ damping: 170 })], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      width: 1320,
    }}>
      <Interactive.Div name="Typed intent" style={{ fontSize: 42, fontWeight: 580, letterSpacing: "-.025em", lineHeight: 1.4, minHeight: 116 }}>
        {beforeTag}{tagComplete ? <span style={{ display: "inline-block", scale: interpolate(frame, [140, 151, 165], [1, 1.14, 1], { easing: [Easing.spring({ damping: 115 }), Easing.spring({ damping: 165 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}><WethTag selected={selected} /></span> : null}{afterTag}<span style={{ opacity: typedLength < prompt.length && frame % 18 < 10 ? 1 : 0 }}>|</span>
      </Interactive.Div>

      <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#737a88", fontSize: 13, fontWeight: 730, letterSpacing: ".08em", marginBottom: 8, opacity: selected ? 1 : 0, textTransform: "uppercase" }}>Attached entity</div>
          <Interactive.Div name="Attached WETH entity" style={{
            alignItems: "center", background: "rgba(55,83,255,.07)", border: "1px solid rgba(55,83,255,.19)", borderRadius: 15, display: "flex", gap: 13,
            opacity: interpolate(frame, [154, 170], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            padding: "11px 14px", translate: interpolate(frame, [154, 173], ["0px 14px", "0px 0px"], { easing: Easing.spring({ damping: 150 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }), width: 560,
          }}>
            <div style={{ alignItems: "center", background: "#11141a", borderRadius: 11, color: "white", display: "flex", fontSize: 21, fontWeight: 800, height: 42, justifyContent: "center", width: 42 }}>Ξ</div>
            <div style={{ flex: 1 }}><div style={{ alignItems: "center", display: "flex", gap: 9 }}><strong style={{ color: "#3650ee", fontSize: 18 }}>@WETH</strong><span style={{ color: "#11141a", fontSize: 16, fontWeight: 680 }}>$2,401.90</span><span style={{ color: "#7a8190", fontSize: 13 }}>52,461 holders</span></div><code style={{ color: "#737a88", display: "block", fontSize: 12, marginTop: 5 }}>{address.slice(0, 10)}…{address.slice(-6)} · X Layer</code></div>
            <Check color="#3650ee" size={19} />
          </Interactive.Div>
        </div>

        <Interactive.Div name="Send intent" style={{
          alignItems: "center", background: sent ? "#3753ff" : selected ? "#11141a" : "#b4b7bd", borderRadius: "50%",
          boxShadow: sent ? "0 0 0 12px rgba(55,83,255,.12)" : "none", display: "flex", height: 62, justifyContent: "center", overflow: "hidden", position: "relative",
          scale: interpolate(frame, [224, 236, 244, 258], [1, 1.1, .82, 1], { easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 110 }), Easing.spring({ damping: 150 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), width: 62,
        }}>
          <div style={{ opacity: interpolate(frame, [234, 244], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [234, 244], ["0px 0px", "0px -30px"], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><ArrowUpIcon size={29} /></div>
          <div style={{ opacity: interpolate(frame, [243, 253], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), position: "absolute", scale: interpolate(frame, [243, 257], [.65, 1], { easing: Easing.spring({ damping: 140 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}><Check /></div>
        </Interactive.Div>
      </div>
    </Interactive.Div>

    <Interactive.Div name="WETH autocomplete" style={{
      background: "rgba(255,255,255,.98)", border: "1px solid #d8dce5", borderRadius: 21, boxShadow: "0 24px 70px rgba(17,20,26,.17)", left: 590,
      opacity: interpolate(frame, [48, 62, 144, 158], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      padding: "18px", position: "absolute", scale: interpolate(frame, [48, 64, 144, 158], [.9, 1, 1, .92], { easing: [Easing.spring({ damping: 150 }), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), top: 226, transformOrigin: "bottom center", width: 510,
    }}>
      <div style={{ color: "#747b89", fontSize: 13, fontWeight: 760, letterSpacing: ".1em", margin: "0 4px 13px", textTransform: "uppercase" }}>Exact X Layer match</div>
      <div style={{ background: "rgba(55,83,255,.08)", border: "1px solid rgba(55,83,255,.18)", borderRadius: 14, padding: "15px" }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}><div><strong style={{ color: "#3650ee", fontSize: 22 }}>@WETH</strong><span style={{ color: "#303541", fontSize: 15, marginLeft: 10 }}>Wrapped Ether</span></div><strong style={{ fontSize: 19 }}>$2,401.90</strong></div>
        <div style={{ color: "#777f8d", display: "flex", fontSize: 13, justifyContent: "space-between", marginTop: 11 }}><code>{address}</code><span style={{ marginLeft: 12, whiteSpace: "nowrap" }}>$42.7K liquidity</span></div>
      </div>
    </Interactive.Div>

    <Sequence from={68} layout="none"><Audio src={staticFile("sfx/tag-chime-1.wav")} volume={.2} /></Sequence>
    <Sequence from={146} layout="none"><Audio src={staticFile("sfx/tag-chime-2.wav")} volume={.58} /></Sequence>
    <Sequence from={236} layout="none"><Audio src={staticFile("sfx/send-chord.wav")} volume={.55} /></Sequence>
  </AbsoluteFill>;
};
