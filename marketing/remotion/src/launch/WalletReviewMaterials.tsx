import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";

const navy = "#101936";
const cobalt = "#3753ff";
const paper = "#f7f8fc";

const enter = (frame: number, from: number) => ({
  opacity: interpolate(frame, [from, from + 15], [0, 1], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  translate: `0px ${interpolate(frame, [from, from + 15], [32, 0], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px`,
});

const frameStyle = {
  background: paper,
  color: navy,
  fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
  overflow: "hidden",
} as const;

const Tag = ({ children }: { readonly children: string }) => (
  <span style={{ background: "#e8ebff", border: `2px solid ${cobalt}`, borderRadius: 12, color: cobalt, fontWeight: 720, padding: "4px 10px 6px", whiteSpace: "nowrap" }}>{children}</span>
);

const CallRow = ({
  frame,
  from,
  number,
  title,
  detail,
}: {
  readonly frame: number;
  readonly from: number;
  readonly number: string;
  readonly title: string;
  readonly detail: React.ReactNode;
}) => (
  <div style={{ alignItems: "center", borderTop: `2px solid #d9deec`, display: "grid", gap: 24, gridTemplateColumns: "78px 1fr", minHeight: 128, padding: "22px 0", ...enter(frame, from) }}>
    <div style={{ alignItems: "center", background: navy, borderRadius: "50%", color: "white", display: "flex", fontSize: 28, fontVariantNumeric: "tabular-nums", fontWeight: 700, height: 58, justifyContent: "center", width: 58 }}>{number}</div>
    <div>
      <div style={{ fontSize: 32, fontWeight: 720, letterSpacing: "-.045em", lineHeight: 1 }}>{title}</div>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", fontSize: 27, fontWeight: 560, gap: 8, letterSpacing: "-.03em", lineHeight: 1.1, marginTop: 14 }}>{detail}</div>
    </div>
  </div>
);

export const WalletPreview = ({ compact = false }: { readonly compact?: boolean }) => {
  const frame = useCurrentFrame();
  const scale = compact ? .86 : 1;
  return <div style={{ background: "white", border: `3px solid ${navy}`, borderRadius: 32, boxShadow: "18px 18px 0 rgba(55,83,255,.15)", overflow: "hidden", padding: "34px 42px", scale, transformOrigin: "top left", width: 875, ...enter(frame, 16) }}>
    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", paddingBottom: 28 }}>
      <div style={{ fontSize: 39, fontWeight: 740, letterSpacing: "-.055em" }}>Review exact calls</div>
      <div style={{ background: "#e8ebff", borderRadius: 99, color: cobalt, fontSize: 22, fontWeight: 720, padding: "9px 14px" }}>Before signing</div>
    </div>
    <CallRow frame={frame} from={31} number="01" title="Spend limit" detail={<><span>Maximum</span><Tag>1 @USDG</Tag></>} />
    <CallRow frame={frame} from={45} number="02" title="Swap" detail={<><Tag>1 @USDG</Tag><span>→ minimum</span><Tag>0.95 @USDt0</Tag></>} />
    <div style={{ alignItems: "center", background: navy, color: "white", display: "flex", fontSize: 26, fontWeight: 680, justifyContent: "space-between", margin: "13px -42px -34px", padding: "23px 42px", ...enter(frame, 63) }}>
      <span>Only your wallet can approve.</span><span style={{ color: "#aebaff" }}>→</span>
    </div>
  </div>;
};

const Stage = ({ children }: { readonly children: React.ReactNode }) => <AbsoluteFill style={frameStyle}>
  <div style={{ backgroundImage: "linear-gradient(rgba(55,83,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(55,83,255,.06) 1px, transparent 1px)", backgroundSize: "72px 72px", inset: 0, position: "absolute" }} />
  <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.17), transparent 68%)", height: 1000, position: "absolute", right: -350, top: -480, width: 1000 }} />
  <header style={{ left: 84, position: "absolute", top: 54 }}><CobiaBrand compact /></header>
  {children}
</AbsoluteFill>;

export const WalletReviewHero = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <div style={{ left: 118, position: "absolute", top: 211, width: 730, ...enter(frame, 2) }}>
      <div style={{ fontSize: 120, fontWeight: 720, letterSpacing: "-.08em", lineHeight: .86 }}>See every<br />call first.</div>
      <div style={{ borderLeft: `6px solid ${cobalt}`, fontSize: 38, fontWeight: 560, letterSpacing: "-.035em", lineHeight: 1.13, marginTop: 55, paddingLeft: 22 }}>The agent can propose a route. It cannot approve it.</div>
    </div>
    <div style={{ position: "absolute", right: 118, top: 208 }}><WalletPreview /></div>
  </Stage>;
};

export const WalletReviewNoBlankCheck = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <div style={{ left: 118, position: "absolute", top: 180, ...enter(frame, 2) }}>
      <div style={{ fontSize: 128, fontWeight: 720, letterSpacing: "-.085em", lineHeight: .83 }}>No blank<br />cheque.</div>
      <div style={{ color: cobalt, fontSize: 48, fontWeight: 700, letterSpacing: "-.05em", marginTop: 45 }}>Review → decide → sign</div>
    </div>
    <div style={{ bottom: 111, display: "grid", gap: 24, gridTemplateColumns: "320px 820px", left: 118, position: "absolute", right: 118 }}>
      <div style={{ background: navy, color: "white", padding: "38px 35px", ...enter(frame, 18) }}>
        <div style={{ fontSize: 31, fontWeight: 650 }}>An agent may</div>
        <div style={{ color: "#b8c3ff", fontSize: 53, fontWeight: 720, letterSpacing: "-.065em", lineHeight: .92, marginTop: 33 }}>propose<br />a route.</div>
      </div>
      <div style={{ ...enter(frame, 29) }}><WalletPreview compact /></div>
    </div>
  </Stage>;
};

export const WalletReviewDecisionGate = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <div style={{ left: 118, position: "absolute", top: 167, width: 840, ...enter(frame, 2) }}>
      <div style={{ fontSize: 124, fontWeight: 720, letterSpacing: "-.08em", lineHeight: .84 }}>Review.<br />Then decide.</div>
    </div>
    <div style={{ left: 118, position: "absolute", top: 526, width: 820, ...enter(frame, 19) }}>
      {["Your outcome", "Signed limits", "Exact calls"].map((item) => <div key={item} style={{ alignItems: "center", borderTop: `2px solid ${navy}`, display: "flex", fontSize: 35, fontWeight: 660, justifyContent: "space-between", padding: "22px 0" }}><span>{item}</span><span style={{ color: cobalt, fontSize: 30 }}>✓</span></div>)}
    </div>
    <div style={{ position: "absolute", right: 118, top: 221 }}><WalletPreview /></div>
  </Stage>;
};
