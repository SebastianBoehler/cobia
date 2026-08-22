import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { landedProgram } from "./evidence";
import { CheckIcon, ProofStage } from "./ProofStage";
import { colors, geistMono } from "./theme";

const proposals = [
  { detail: "Direct swap", id: "01", result: "Policy pass", state: "winner", y: 278 },
  { detail: "Low output", id: "02", result: "Minimum missed", state: "rejected", y: 468 },
  { detail: "Two-hop swap", id: "03", result: "Policy pass", state: "eligible", y: 658 },
] as const;

const paths = [
  "M680 540 C770 540 760 350 920 350",
  "M680 540 C790 540 790 540 920 540",
  "M680 540 C770 540 760 730 920 730",
] as const;

export const SolverScene = () => {
  const frame = useCurrentFrame();
  const decided = frame >= 122;

  return (
    <ProofStage>
      <Interactive.Div name="Intent source" style={{
        background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 24, boxShadow: "0 22px 68px rgba(17,20,26,.1)", height: interpolate(frame, [0, 28], [100, 210], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        left: interpolate(frame, [0, 28], [430, 260], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }), overflow: "hidden", position: "absolute", top: interpolate(frame, [0, 28], [490, 435], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }), width: interpolate(frame, [0, 28], [1060, 420], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }), zIndex: 2,
      }}>
        <div style={{ alignItems: "center", display: "flex", fontFamily: geistMono, fontSize: 21, inset: 0, justifyContent: "space-between", opacity: interpolate(frame, [8, 22], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "0 28px", position: "absolute", whiteSpace: "nowrap" }}><span>{landedProgram.intent}</span><span style={{ color: colors.cobalt, fontSize: 28 }}>→</span></div>
        <div style={{ display: "flex", flexDirection: "column", inset: 0, justifyContent: "space-between", opacity: interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "28px", position: "absolute" }}>
          <span style={{ color: colors.cobaltDark, fontFamily: geistMono, fontSize: 15 }}>INTENT</span>
          <strong style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.015em" }}>USDG → USDt0</strong>
          <span style={{ color: colors.muted, fontFamily: geistMono, fontSize: 16 }}>&gt; .95 · X LAYER</span>
        </div>
      </Interactive.Div>

      <svg aria-hidden="true" height="1080" style={{ inset: 0, position: "absolute" }} viewBox="0 0 1920 1080" width="1920">
        {paths.map((path, index) => <path key={path} d={path} fill="none" pathLength="1" stroke={index === 1 ? colors.rejected : colors.cobalt} strokeDasharray="1" strokeDashoffset={interpolate(frame, [24 + index * 5, 74 + index * 7], [1, 0], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })} strokeLinecap="round" strokeWidth="3" />)}
        <circle cx="680" cy="540" fill={colors.cobalt} opacity={interpolate(frame, [20, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} r="10" />
        {proposals.map((proposal, index) => <circle key={proposal.id} cx={interpolate(frame, [34 + index * 5, proposal.state === "winner" ? 88 : 112], [688, proposal.state === "rejected" ? 842 : 910], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })} cy={interpolate(frame, [34 + index * 5, 72 + index * 7], [540, proposal.y + 72], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })} fill={proposal.state === "rejected" ? colors.rejected : colors.cobalt} opacity={interpolate(frame, [28 + index * 5, 40 + index * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} r="8" />)}
      </svg>

      {proposals.map((proposal, index) => {
        const rejected = proposal.state === "rejected" && frame >= 102;
        const winner = proposal.state === "winner" && decided;
        const eligible = proposal.state === "eligible" && frame >= 114;
        return <Interactive.Div key={proposal.id} name={`Solver ${proposal.id} route`} style={{
          alignItems: "center", background: winner ? colors.ink : colors.surface, border: `1px solid ${winner ? colors.ink : rejected ? colors.rejected : eligible ? colors.verified : colors.line}`, borderRadius: 22, boxShadow: winner ? "0 24px 72px rgba(17,20,26,.2)" : "0 16px 48px rgba(17,20,26,.07)", color: winner ? colors.paper : colors.ink,
          display: "grid", gap: 26, gridTemplateColumns: "104px 1fr auto", height: 145, left: 920, opacity: interpolate(frame, [38 + index * 8, 56 + index * 8], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (decided && !winner ? .48 : 1), padding: "0 30px", position: "absolute", right: 270, scale: interpolate(frame, [38 + index * 8, 60 + index * 8, 122, 142], [.96, 1, 1, proposal.state === "winner" ? 1.025 : .98], { easing: [Easing.spring({ damping: 180 }), Easing.linear, Easing.spring({ damping: 190 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), top: proposal.y,
        }}>
          <span style={{ color: winner ? "#9eafff" : colors.cobaltDark, fontFamily: geistMono, fontSize: 17 }}>SOLVER {proposal.id}</span>
          <div><strong style={{ display: "block", fontSize: 31, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 7 }}>{proposal.detail}</strong><span style={{ color: winner ? colors.darkMuted : rejected ? colors.rejected : colors.muted, fontFamily: geistMono, fontSize: 16 }}>{proposal.result}</span></div>
          <span style={{ color: rejected ? colors.rejected : winner ? "#9eafff" : eligible ? colors.verified : colors.muted, fontFamily: geistMono, fontSize: 14 }}>{rejected ? "REJECTED" : winner ? <CheckIcon color="#9eafff" size={25} /> : eligible ? "ELIGIBLE" : "RACING"}</span>
        </Interactive.Div>;
      })}
    </ProofStage>
  );
};
