import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CheckIcon, ProofStage } from "./ProofStage";
import { colors, geistMono } from "./theme";

const checks = [
  ["Targets", "Allowlist match"],
  ["Replay", "Balances match"],
  ["Minimum", "> .95 USDt0"],
] as const;

export const VerificationScene = () => {
  const frame = useCurrentFrame();
  const executed = frame >= 105;

  return (
    <ProofStage>
      <Interactive.Div name="Winning program" style={{
        background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 26, boxShadow: "0 30px 90px rgba(17,20,26,.12)", left: 380,
        opacity: interpolate(frame, [0, 18], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "34px 38px", position: "absolute", right: 380,
        scale: interpolate(frame, [0, 24], [.94, 1], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), top: "50%", translate: "0 -50%",
      }}>
        <div style={{ alignItems: "center", borderBottom: `1px solid ${colors.line}`, display: "flex", justifyContent: "space-between", paddingBottom: 26 }}><span style={{ fontFamily: geistMono, fontSize: 17 }}>PROGRAM · SOLVER 01</span><span style={{ background: executed ? "rgba(37,131,90,.11)" : colors.cobaltWash, borderRadius: 999, color: executed ? colors.verified : colors.cobaltDark, fontFamily: geistMono, fontSize: 14, padding: "9px 13px" }}>{executed ? "EXECUTED" : "VERIFIED"}</span></div>

        <div style={{ alignItems: "center", display: "grid", gap: 46, gridTemplateColumns: "1fr auto", padding: "40px 0" }}>
          <div><span style={{ color: colors.muted, display: "block", fontFamily: geistMono, fontSize: 14, marginBottom: 12 }}>EXACT PROGRAM</span><strong style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-.02em" }}>USDG → USDt0</strong></div>
          <span style={{ color: colors.verified, fontFamily: geistMono, fontSize: 24 }}>&gt; .95</span>
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
          {checks.map(([title, detail], index) => {
            const passed = frame >= 28 + index * 18;
            return <Interactive.Div key={title} name={title} style={{ alignItems: "center", background: "#f3f5f8", borderRadius: 16, display: "grid", gap: 14, gridTemplateColumns: "42px 1fr", opacity: interpolate(frame, [18 + index * 12, 34 + index * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "20px" }}>
              <div style={{ alignItems: "center", background: passed ? "rgba(37,131,90,.12)" : colors.surface, borderRadius: "50%", color: colors.verified, display: "flex", height: 42, justifyContent: "center", width: 42 }}>{passed ? <CheckIcon size={22} /> : null}</div>
              <div><strong style={{ display: "block", fontSize: 20, fontWeight: 600, marginBottom: 5 }}>{title}</strong><span style={{ color: colors.muted, fontFamily: geistMono, fontSize: 13 }}>{detail}</span></div>
            </Interactive.Div>;
          })}
        </div>

        <Interactive.Div name="Execute program" style={{ alignItems: "center", background: executed ? colors.verified : colors.cobalt, borderRadius: 14, color: "white", display: "flex", fontSize: 20, fontWeight: 650, justifyContent: "space-between", marginTop: 24, opacity: interpolate(frame, [68, 86], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "19px 22px" }}><span>{executed ? "Program executed" : "Approve exact calls"}</span>{executed ? <CheckIcon size={24} /> : <span style={{ fontFamily: geistMono, fontSize: 14 }}>wallet →</span>}</Interactive.Div>
      </Interactive.Div>
    </ProofStage>
  );
};
