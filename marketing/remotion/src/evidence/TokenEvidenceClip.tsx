import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { ArrowUpIcon, Stage, cobiaColors } from "../shared/Stage";

const intent = "Swap 1 @USDG into at least 0.95 @USDt0 on @XLayer";
const timing: Record<string, number> = { "@USDG": 76, "@USDt0": 168, "@XLayer": 246 };
const details: Record<string, string> = { "@USDG": "Asset on X Layer", "@USDt0": "Asset on X Layer", "@XLayer": "Chain 196" };

const Check = () => <svg aria-hidden="true" height="32" viewBox="0 0 24 24" width="32"><path d="m5.5 12.5 4 4 9-9" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" /></svg>;

const IntentText = ({ count }: { readonly count: number }) => {
  const frame = useCurrentFrame();
  return intent.slice(0, count).split(/(@[A-Za-z0-9]+)/g).map((part, index) => {
    const resolved = timing[part] ?? 999;
    return part.startsWith("@") ? <span key={`${part}-${index}`} style={{
      background: cobiaColors.cobaltWash, border: `2px solid ${frame >= resolved ? cobiaColors.cobalt : "transparent"}`, borderRadius: 14,
      color: cobiaColors.cobaltDark, display: "inline-block", fontWeight: 750, margin: "0 4px", padding: "3px 10px 6px",
      scale: interpolate(frame, [resolved - 6, resolved + 9], [.9, 1], { easing: Easing.spring({ damping: 150 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
    }}>{part}</span> : part;
  });
};

const TokenCard = ({ tag, index }: { readonly index: number; readonly tag: string }) => {
  const frame = useCurrentFrame();
  const from = timing[tag] ?? 0;
  return <Interactive.Div name={`${tag} parsed object`} style={{
    alignItems: "center", background: index === 2 ? cobiaColors.ink : "white", border: `2px solid ${index === 2 ? cobiaColors.ink : cobiaColors.line}`,
    borderRadius: 24, color: index === 2 ? "white" : cobiaColors.ink, display: "grid", gap: 16, gridTemplateColumns: "1fr auto",
    opacity: interpolate(frame, [from - 8, from + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), padding: "26px 28px",
    translate: interpolate(frame, [from - 8, from + 14], ["0px 30px", "0px 0px"], { easing: Easing.spring({ damping: 180 }), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  }}>
    <div><strong style={{ color: index === 2 ? "#aebaff" : cobiaColors.cobaltDark, display: "block", fontSize: 36 }}>{tag}</strong><span style={{ color: index === 2 ? "#b8c0d4" : cobiaColors.muted, fontSize: 23 }}>{details[tag]}</span></div>
    <div style={{ alignItems: "center", background: cobiaColors.cobalt, borderRadius: "50%", display: "flex", height: 48, justifyContent: "center", width: 48 }}><Check /></div>
  </Interactive.Div>;
};

export const TokenEvidenceClip = () => {
  const frame = useCurrentFrame();
  const count = Math.floor(interpolate(frame, [28, 230], [0, intent.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const sent = frame >= 292;
  return <Stage>
    <div style={{ display: "flex", flexDirection: "column", inset: "56px 92px", justifyContent: "space-between", position: "absolute" }}>
      <CobiaBrand compact />
      <div style={{ display: "grid", gap: 54, gridTemplateColumns: "1.55fr .75fr" }}>
        <div>
          <h1 style={{ fontSize: 94, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .92, margin: "0 0 42px" }}>Tags become<br />reviewable objects.</h1>
          <Interactive.Div name="Tagged intent bar" style={{ background: "white", border: `3px solid ${cobiaColors.ink}`, borderRadius: 32, boxShadow: "14px 14px 0 rgba(55,83,255,.15)", minHeight: 245, padding: "34px 36px", position: "relative" }}>
            <div style={{ fontSize: 50, fontWeight: 600, letterSpacing: "-.04em", lineHeight: 1.35, paddingRight: 80 }}>
              {count ? <IntentText count={count} /> : <span style={{ color: cobiaColors.muted }}>Ask Cobia to do something onchain…</span>}
              {frame < 252 ? <span style={{ color: cobiaColors.cobalt, opacity: frame % 16 < 8 ? 1 : 0 }}>│</span> : null}
            </div>
            <div style={{ alignItems: "center", background: sent ? cobiaColors.cobalt : count === intent.length ? cobiaColors.ink : "#aeb3bd", borderRadius: "50%", bottom: 26, display: "flex", height: 70, justifyContent: "center", position: "absolute", right: 26, width: 70 }}>{sent ? <Check /> : <ArrowUpIcon size={32} />}</div>
          </Interactive.Div>
        </div>
        <div style={{ display: "grid", gap: 16, paddingTop: 102 }}>
          {["@USDG", "@USDt0", "@XLayer"].map((tag, index) => <TokenCard index={index} key={tag} tag={tag} />)}
        </div>
      </div>
      <p style={{ color: cobiaColors.muted, fontSize: 33, lineHeight: 1.25, margin: 0 }}>The verifier receives explicit assets, limits, and chain context.</p>
    </div>
    <CobiaSoundDesign cues={[{ file: "orbit.wav", frame: 72 }, { file: "slide.wav", frame: 164 }, { file: "lift.wav", frame: 242 }, { file: "resolve.wav", frame: 292, volume: .68 }]} />
  </Stage>;
};
