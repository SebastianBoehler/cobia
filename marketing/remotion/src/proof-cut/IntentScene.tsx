import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { ArrowIcon, CheckIcon, ProofStage } from "./ProofStage";
import { colors, geistMono } from "./theme";

const typed = (frame: number, text: string, start: number, end: number) => text.slice(0, Math.floor(interpolate(
  frame, [start, end], [0, text.length], { easing: Easing.bezier(.3, 0, .2, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
)));

const Tag = ({ children, selected }: { readonly children: string; readonly selected: boolean }) => (
  <strong style={{ background: selected ? colors.cobaltWash : "rgba(55,83,255,.08)", borderRadius: 8, color: colors.cobaltDark, fontFamily: geistMono, fontWeight: 600, padding: "3px 7px 5px" }}>{children}</strong>
);

const Picker = ({ detail, end, left, start, tag }: { readonly detail: string; readonly end: number; readonly left: number; readonly start: number; readonly tag: string }) => {
  const frame = useCurrentFrame();
  return <Interactive.Div name={`${tag} picker`} style={{
    background: colors.ink,
    borderRadius: 14,
    boxShadow: "0 18px 54px rgba(17,20,26,.22)",
    color: colors.paper,
    left,
    opacity: interpolate(frame, [start, start + 6, end - 5, end], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    padding: 7,
    position: "absolute",
    scale: interpolate(frame, [start, start + 8], [.94, 1], { easing: Easing.spring({ damping: 160 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
    top: 88,
    width: 330,
  }}>
    <div style={{ alignItems: "center", background: "rgba(55,83,255,.18)", borderRadius: 9, display: "grid", gap: 10, gridTemplateColumns: "auto 1fr auto", minHeight: 52, padding: "9px 11px" }}>
      <strong style={{ color: "#9eafff", fontFamily: geistMono, fontSize: 15 }}>{tag}</strong>
      <span style={{ color: colors.darkMuted, fontFamily: geistMono, fontSize: 12 }}>{detail}</span>
      <CheckIcon color="#9eafff" size={18} />
    </div>
  </Interactive.Div>;
};

export const IntentScene = () => {
  const frame = useCurrentFrame();
  const usdgSelected = frame >= 45;
  const usdtSelected = frame >= 92;
  const chainSelected = frame >= 128;
  const sent = frame >= 137;

  return (
    <ProofStage>
      <Interactive.Div name="Intent composer" style={{
          bottom: interpolate(frame, [132, 149], [425, 490], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          background: colors.surface,
          border: `1px solid ${colors.line}`,
          borderRadius: 24,
          boxShadow: "0 28px 90px rgba(17,20,26,.12)",
          display: "flex",
          flexDirection: "column",
          height: interpolate(frame, [132, 149], [230, 108], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          justifyContent: "space-between",
          left: interpolate(frame, [132, 149], [360, 430], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          opacity: interpolate(frame, [0, 14], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          overflow: "visible",
          padding: interpolate(frame, [132, 149], [28, 26], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          position: "absolute",
          right: interpolate(frame, [132, 149], [360, 430], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          scale: interpolate(frame, [8, 30], [.96, 1], { easing: Easing.spring({ damping: 190 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
        }}>
          <div style={{ alignItems: "center", display: "flex", fontSize: interpolate(frame, [132, 149], [39, 27], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), fontWeight: 500, letterSpacing: "-.015em", lineHeight: 1.42, minHeight: 70, whiteSpace: "nowrap" }}>
            {typed(frame, "Swap 1 ", 10, 22)}
            {frame >= 22 ? <Tag selected={usdgSelected}>{typed(frame, "@USDG", 22, 36)}</Tag> : null}
            {usdgSelected ? typed(frame, " into > .95 ", 45, 65) : null}
            {frame >= 65 ? <Tag selected={usdtSelected}>{typed(frame, "@USDt0", 65, 80)}</Tag> : null}
            {usdtSelected ? typed(frame, " on ", 92, 102) : null}
            {frame >= 102 ? <Tag selected={chainSelected}>{typed(frame, "@XLayer", 102, 118)}</Tag> : null}
            {frame >= 8 && frame < 128 ? <span style={{ color: colors.cobalt, opacity: frame % 16 < 9 ? 1 : 0 }}>│</span> : null}
          </div>
          <div style={{ alignItems: "center", display: frame >= 132 ? "none" : "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10 }}>{["Round trip⌄", "@ Mention", "Routes"].map((label) => <span key={label} style={{ background: "#f1f3f7", borderRadius: 999, color: colors.muted, fontSize: 15, padding: "11px 15px" }}>{label}</span>)}</div>
            <div style={{ alignItems: "center", background: sent ? colors.cobalt : chainSelected ? colors.ink : "#aeb3bd", borderRadius: "50%", boxShadow: sent ? `0 0 0 ${interpolate(frame, [137, 149], [0, 28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px rgba(55,83,255,.1)` : "none", color: "white", display: "flex", height: 50, justifyContent: "center", scale: interpolate(frame, [132, 137, 143], [1, .78, 1], { easing: Easing.spring({ damping: 140 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), width: 50 }}>
              {sent ? <CheckIcon size={24} /> : <ArrowIcon size={23} />}
            </div>
          </div>
          <Picker detail="0x5dE5…" end={45} left={130} start={30} tag="@USDG" />
          <Picker detail="0x779D…" end={92} left={540} start={77} tag="@USDt0" />
          <Picker detail="Chain 196" end={128} left={790} start={114} tag="@XLayer" />
      </Interactive.Div>
    </ProofStage>
  );
};
