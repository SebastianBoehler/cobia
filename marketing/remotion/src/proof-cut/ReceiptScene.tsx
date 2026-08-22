import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { landedProgram } from "./evidence";
import { CheckIcon, ProofStage } from "./ProofStage";
import { colors, geistMono } from "./theme";

export const ReceiptScene = () => {
  const frame = useCurrentFrame();
  const received = (1.000367 * interpolate(frame, [12, 54], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })).toFixed(6);

  return (
    <ProofStage>
      <main style={{ left: 350, position: "absolute", right: 350, top: "50%", translate: "0 -50%" }}>
        <Interactive.Div name="Confirmed balance" style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 26, boxShadow: "0 28px 80px rgba(17,20,26,.1)", opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), overflow: "hidden", scale: interpolate(frame, [0, 24], [.95, 1], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}>
          <div style={{ alignItems: "center", borderBottom: `1px solid ${colors.line}`, display: "flex", justifyContent: "space-between", padding: "28px 34px" }}><span style={{ color: colors.verified, fontFamily: geistMono, fontSize: 16, fontWeight: 600 }}>CONFIRMED · X LAYER</span><div style={{ alignItems: "center", background: colors.verified, borderRadius: "50%", color: "white", display: "flex", height: 42, justifyContent: "center", width: 42 }}><CheckIcon size={23} /></div></div>
          <div style={{ padding: "44px 34px 38px" }}><span style={{ color: colors.muted, display: "block", fontFamily: geistMono, fontSize: 14, marginBottom: 14 }}>RECEIVED</span><strong style={{ color: colors.verified, display: "block", fontFamily: geistMono, fontSize: 64, fontWeight: 500, letterSpacing: "-.018em" }}>+{received} USDt0</strong></div>
          <div style={{ alignItems: "center", background: colors.cobaltWash, display: "flex", justifyContent: "space-between", padding: "24px 34px" }}><span style={{ color: colors.cobaltDark, fontFamily: geistMono, fontSize: 15 }}>USDt0 BALANCE</span><strong style={{ color: colors.cobaltDark, fontFamily: geistMono, fontSize: 28 }}>1.326361</strong></div>
        </Interactive.Div>
        <Interactive.Div name="Transaction evidence" style={{ background: colors.ink, borderRadius: 18, color: colors.paper, marginTop: 18, opacity: interpolate(frame, [54, 76], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "21px 26px", translate: interpolate(frame, [54, 80], ["0px 22px", "0px 0px"], { easing: Easing.spring({ damping: 180 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ alignItems: "center", display: "grid", gap: 24, gridTemplateColumns: "minmax(0, 1fr) auto" }}><code style={{ fontFamily: geistMono, fontSize: 18 }}>{landedProgram.hash}</code><span style={{ color: colors.darkMuted, fontFamily: geistMono, fontSize: 13 }}>BLOCK {landedProgram.block}</span></div>
        </Interactive.Div>
      </main>
    </ProofStage>
  );
};
