import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand, CobiaMark } from "../../brand/CobiaBrand";
import { landedProgram } from "../../proof-cut/evidence";
import { WalletPreview } from "../WalletReviewMaterials";

const cobalt = "#3753ff";
const navy = "#101936";

const Stage = ({ brand = true, children, dark = false }: { readonly brand?: boolean; readonly children: React.ReactNode; readonly dark?: boolean }) => <AbsoluteFill style={{ background: dark ? navy : "#f7f8fc", color: dark ? "white" : navy, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", overflow: "hidden" }}>
  <div style={{ backgroundImage: `linear-gradient(${dark ? "rgba(255,255,255,.06)" : "rgba(55,83,255,.06)"} 1px, transparent 1px), linear-gradient(90deg, ${dark ? "rgba(255,255,255,.06)" : "rgba(55,83,255,.06)"} 1px, transparent 1px)`, backgroundSize: "72px 72px", inset: 0, position: "absolute" }} />
  {brand ? <header style={{ left: 84, position: "absolute", top: 54 }}><CobiaBrand compact inverted={dark} /></header> : null}
  {children}
</AbsoluteFill>;

const reveal = (frame: number, from: number) => ({
  opacity: interpolate(frame, [from, from + 16], [0, 1], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  translate: `0px ${interpolate(frame, [from, from + 16], [42, 0], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
});

const Tag = ({ children }: { readonly children: string }) => <span style={{ background: "#e7eaff", border: `2px solid ${cobalt}`, borderRadius: 14, color: cobalt, display: "inline-block", fontWeight: 740, padding: "5px 12px 8px", whiteSpace: "nowrap" }}>{children}</span>;

export const NativeHookScene = () => {
  const frame = useCurrentFrame();
  return <Stage dark>
    <Interactive.Div name="Native launch hook" style={{ left: 118, position: "absolute", top: 243, width: 1580, ...reveal(frame, 3) }}>
      <div style={{ color: "#9eafff", fontSize: 55, fontWeight: 700, letterSpacing: "-.05em" }}>let the solver cook.</div>
      <div style={{ fontSize: 142, fontWeight: 740, letterSpacing: "-.085em", lineHeight: .84, marginTop: 31 }}>make the verifier<br />read the recipe.</div>
    </Interactive.Div>
  </Stage>;
};

export const BlankChequeHookScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="No blank cheque hook" style={{ left: 118, position: "absolute", top: 250, width: 1600, ...reveal(frame, 3) }}>
      <div style={{ fontSize: 158, fontWeight: 740, letterSpacing: "-.09em", lineHeight: .82 }}>No blank<br />cheque.</div>
      <div style={{ borderLeft: `7px solid ${cobalt}`, fontSize: 47, fontWeight: 590, letterSpacing: "-.04em", lineHeight: 1.1, marginTop: 54, paddingLeft: 25 }}>An AI plan is not approval.</div>
    </Interactive.Div>
  </Stage>;
};

export const ProofHookScene = () => {
  const frame = useCurrentFrame();
  return <Stage dark>
    <Interactive.Div name="Proof hook" style={{ left: 118, position: "absolute", top: 273, width: 1650, ...reveal(frame, 3) }}>
      <div style={{ fontSize: 151, fontWeight: 740, letterSpacing: "-.09em", lineHeight: .82 }}>proof or it<br />didn't happen.</div>
    </Interactive.Div>
  </Stage>;
};

export const IntentScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Intent title" style={{ fontSize: 116, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .86, position: "absolute", top: 190, ...reveal(frame, 2) }}>State the<br />outcome.</Interactive.Div>
    <Interactive.Div name="Intent bar" style={{ alignItems: "center", background: "white", border: `3px solid ${navy}`, borderRadius: 31, boxShadow: "16px 16px 0 rgba(55,83,255,.15)", display: "flex", fontSize: 48, fontWeight: 630, left: 118, letterSpacing: "-.045em", minHeight: 220, padding: "31px 34px", position: "absolute", right: 118, top: 575, ...reveal(frame, 20) }}>
      <span>Swap 1 </span><Tag>@USDG</Tag><span>&nbsp;into at least 0.95&nbsp;</span><Tag>@USDt0</Tag><span>&nbsp;on&nbsp;</span><Tag>@XLayer</Tag>
      <span style={{ alignItems: "center", background: cobalt, borderRadius: "50%", color: "white", display: "flex", fontSize: 42, height: 78, justifyContent: "center", marginLeft: "auto", width: 78 }}>→</span>
    </Interactive.Div>
  </Stage>;
};

export const SolverScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Solver title" style={{ fontSize: 111, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .86, position: "absolute", top: 185, ...reveal(frame, 2) }}>Three routes.<br />One signed policy.</Interactive.Div>
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(3, 1fr)", left: 118, position: "absolute", right: 118, top: 570 }}>
      {["fastest", "best outcome", "rejected"].map((label, index) => <Interactive.Div key={label} name={`Solver route ${index + 1}`} style={{ background: index === 1 ? navy : "white", border: `3px solid ${navy}`, borderRadius: 25, color: index === 1 ? "white" : navy, minHeight: 220, padding: "28px 31px", ...reveal(frame, 18 + index * 10) }}>
        <div style={{ color: index === 1 ? "#aebaff" : cobalt, fontSize: 24, fontVariantNumeric: "tabular-nums", fontWeight: 720 }}>route 0{index + 1}</div>
        <div style={{ fontSize: 49, fontWeight: 720, letterSpacing: "-.06em", marginTop: 50 }}>{label}</div>
      </Interactive.Div>)}
    </div>
  </Stage>;
};

export const LimitsScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Limits title" style={{ fontSize: 116, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .86, position: "absolute", top: 175, ...reveal(frame, 2) }}>Signed limits<br />said ngmi.</Interactive.Div>
    <div style={{ display: "grid", gap: 22, gridTemplateColumns: "1fr 1fr 1fr", left: 118, position: "absolute", right: 118, top: 575 }}>
      {[["maximum", "1 @USDG"], ["minimum", ".95 @USDt0"], ["network", "@XLayer"]].map(([label, value], index) => <Interactive.Div key={label} name={`${label} limit`} style={{ background: index === 1 ? "#e7eaff" : "white", border: `3px solid ${index === 1 ? cobalt : navy}`, borderRadius: 24, minHeight: 190, padding: "27px 31px", ...reveal(frame, 18 + index * 10) }}>
        <div style={{ color: cobalt, fontSize: 25, fontWeight: 720 }}>{label}</div>
        <div style={{ fontSize: 48, fontWeight: 740, letterSpacing: "-.06em", marginTop: 42 }}>{value}</div>
      </Interactive.Div>)}
    </div>
  </Stage>;
};

export const WalletScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Wallet title" style={{ fontSize: 111, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .86, position: "absolute", top: 192, width: 720, ...reveal(frame, 2) }}>Review the<br />exact calls.</Interactive.Div>
    <Interactive.Div name="Wallet support" style={{ borderLeft: `6px solid ${cobalt}`, fontSize: 42, fontWeight: 580, left: 118, letterSpacing: "-.035em", lineHeight: 1.12, paddingLeft: 23, position: "absolute", top: 500, width: 580, ...reveal(frame, 17) }}>Only your wallet can approve.</Interactive.Div>
    <div style={{ position: "absolute", right: 118, top: 203 }}><WalletPreview /></div>
  </Stage>;
};

export const PriorProofScene = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Prior proof title" style={{ fontSize: 108, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .86, position: "absolute", top: 182, ...reveal(frame, 2) }}>A prior program.<br />A public receipt.</Interactive.Div>
    <Interactive.Div name="Prior proof receipt" style={{ alignItems: "end", background: navy, bottom: 115, color: "white", display: "grid", gap: 40, gridTemplateColumns: "1.1fr .9fr", left: 118, padding: "34px 39px", position: "absolute", right: 118, ...reveal(frame, 22) }}>
      <div><div style={{ color: "#aebaff", fontSize: 27, fontWeight: 680 }}>Prior proof · {landedProgram.chain}</div><div style={{ fontSize: 73, fontVariantNumeric: "tabular-nums", fontWeight: 740, letterSpacing: "-.07em", marginTop: 27 }}>{landedProgram.outcome}</div></div>
      <div><div style={{ color: "#aebaff", fontSize: 26, fontWeight: 680 }}>Block</div><div style={{ fontFamily: "monospace", fontSize: 47, fontVariantNumeric: "tabular-nums", fontWeight: 700, marginTop: 24 }}>{landedProgram.block}</div></div>
    </Interactive.Div>
  </Stage>;
};

export const EndScene = ({ line }: { readonly line: string }) => {
  const frame = useCurrentFrame();
  return <Stage brand={false} dark>
    <Interactive.Div name="End logo" style={{ alignItems: "center", background: cobalt, borderRadius: 24, display: "flex", height: 104, justifyContent: "center", left: 118, position: "absolute", top: 203, width: 104, ...reveal(frame, 2) }}><CobiaMark color="white" size={76} /></Interactive.Div>
    <Interactive.Div name="End statement" style={{ fontSize: 112, fontWeight: 740, left: 118, letterSpacing: "-.08em", lineHeight: .84, position: "absolute", top: 364, width: 1500, ...reveal(frame, 15) }}>{line}</Interactive.Div>
    <Interactive.Div name="End link" style={{ background: "white", bottom: 90, color: navy, fontSize: 44, fontWeight: 720, left: 118, padding: "18px 27px", position: "absolute", ...reveal(frame, 32) }}>getcobia.com</Interactive.Div>
  </Stage>;
};
