import { clockWipe } from "@remotion/transitions/clock-wipe";
import { flip } from "@remotion/transitions/flip";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand, CobiaMark } from "../brand/CobiaBrand";
import { landedProgram } from "../proof-cut/evidence";

const navy = "#101936";
const cobalt = "#3753ff";
const paper = "#f7f8fc";

const rise = (frame: number, delay = 0) => ({
  opacity: interpolate(frame, [delay, delay + 16], [0, 1], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  translate: `0px ${interpolate(frame, [delay, delay + 16], [44, 0], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px`,
});

const Scene = ({ children }: { readonly children: React.ReactNode }) => (
  <AbsoluteFill style={{ background: paper, color: navy, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", overflow: "hidden" }}>
    <div style={{ backgroundImage: "linear-gradient(rgba(55,83,255,.065) 1px, transparent 1px), linear-gradient(90deg, rgba(55,83,255,.065) 1px, transparent 1px)", backgroundSize: "72px 72px", inset: 0, position: "absolute" }} />
    <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.16), transparent 68%)", height: 1100, position: "absolute", right: -400, top: -550, width: 1100 }} />
    <header style={{ left: 84, position: "absolute", top: 54, zIndex: 2 }}>
      <CobiaBrand compact />
    </header>
    {children}
  </AbsoluteFill>
);

const Intro = () => {
  const frame = useCurrentFrame();
  return <Scene>
    <div style={{ left: 122, position: "absolute", top: 280, width: 1480, ...rise(frame, 6) }}>
      <div style={{ fontSize: 146, fontWeight: 700, letterSpacing: "-.075em", lineHeight: .88, textWrap: "balance" }}>An AI plan<br />is not approval.</div>
      <div style={{ borderLeft: `6px solid ${cobalt}`, fontSize: 43, fontWeight: 500, letterSpacing: "-.035em", lineHeight: 1.15, marginTop: 58, paddingLeft: 25, width: 800, ...rise(frame, 26) }}>Cobia separates the search from the decision.</div>
    </div>
  </Scene>;
};

const IntentTag = ({ children, frame, from }: { readonly children: string; readonly frame: number; readonly from: number }) => (
  <span style={{
    background: "linear-gradient(135deg, #dfe4ff, #eef0ff)",
    border: `2px solid ${cobalt}`,
    borderRadius: 15,
    boxShadow: `0 0 0 ${interpolate(frame, [from, from + 10], [0, 14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px rgba(55,83,255,.12)`,
    color: cobalt,
    display: "inline-block",
    fontWeight: 750,
    margin: "0 8px",
    opacity: interpolate(frame, [from - 6, from], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    padding: "5px 12px 9px",
    scale: interpolate(frame, [from - 6, from + 10], [.7, 1], { easing: Easing.spring({ damping: 130 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
  }}>{children}</span>
);

const Intent = () => {
  const frame = useCurrentFrame();
  return <Scene>
    <div style={{ left: 118, position: "absolute", top: 210, width: 1680, ...rise(frame, 4) }}>
      <div style={{ fontSize: 118, fontWeight: 700, letterSpacing: "-.075em", lineHeight: .9 }}>Tell Cobia<br />the outcome.</div>
      <div style={{ alignItems: "center", background: "white", border: `3px solid ${navy}`, borderRadius: 34, boxShadow: "16px 16px 0 rgba(55,83,255,.16)", display: "flex", marginTop: 65, minHeight: 240, padding: "34px 36px", width: 1560, ...rise(frame, 24) }}>
        <div style={{ flex: 1, fontSize: 53, fontWeight: 620, letterSpacing: "-.045em", lineHeight: 1.2, whiteSpace: "nowrap" }}>
          Swap 1 <IntentTag frame={frame} from={46}>@USDG</IntentTag> into at least 0.95 <IntentTag frame={frame} from={66}>@USDt0</IntentTag> on <IntentTag frame={frame} from={86}>@XLayer</IntentTag>
        </div>
        <div style={{ alignItems: "center", background: cobalt, borderRadius: "50%", color: "white", display: "flex", fontSize: 48, height: 84, justifyContent: "center", marginLeft: 24, scale: interpolate(frame, [100, 111, 122], [1, .78, 1], { easing: Easing.spring({ damping: 130 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), width: 84 }}>→</div>
      </div>
    </div>
  </Scene>;
};

const Solver = () => {
  const frame = useCurrentFrame();
  return <Scene>
    <div style={{ alignItems: "end", display: "flex", left: 118, position: "absolute", right: 118, top: 203, ...rise(frame, 4) }}>
      <div style={{ color: cobalt, fontSize: 330, fontWeight: 760, letterSpacing: "-.12em", lineHeight: .67 }}>3</div>
      <div style={{ fontSize: 98, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .85, marginLeft: 47 }}>solver<br />programs.</div>
      <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.15, margin: "0 0 11px 86px", width: 390 }}>One policy decides what may reach the wallet.</div>
    </div>
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(3, 1fr)", left: 118, position: "absolute", right: 118, top: 558, ...rise(frame, 24) }}>
      {["propose", "verify", "approve"].map((state, index) => <div key={state} style={{ background: index === 1 ? navy : "white", border: `2px solid ${navy}`, borderRadius: 28, color: index === 1 ? "white" : navy, minHeight: 208, padding: "27px 30px" }}>
        <div style={{ color: index === 1 ? "#aebaff" : cobalt, fontFamily: "monospace", fontSize: 17, fontWeight: 700, letterSpacing: ".12em" }}>0{index + 1}</div>
        <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-.055em", marginTop: 29, textTransform: "capitalize" }}>{state}</div>
      </div>)}
    </div>
  </Scene>;
};

const Receipt = () => {
  const frame = useCurrentFrame();
  return <Scene>
    <div style={{ left: 118, position: "absolute", right: 118, top: 213, ...rise(frame, 4) }}>
      <div style={{ fontSize: 117, fontWeight: 700, letterSpacing: "-.075em", lineHeight: .88 }}>The wallet sees<br />exact calls.</div>
      <div style={{ alignItems: "stretch", display: "grid", gridTemplateColumns: "1.06fr .94fr", marginTop: 56, width: 1580, ...rise(frame, 28) }}>
        <div style={{ background: navy, color: "white", padding: "31px 38px" }}>
          <div style={{ color: "#c7cee7", fontSize: 27, fontWeight: 600 }}>Prior program receipt · X Layer 196</div>
          <div style={{ fontSize: 70, fontWeight: 700, letterSpacing: "-.07em", marginTop: 29 }}>{landedProgram.outcome}</div>
        </div>
        <div style={{ background: "white", border: `2px solid ${navy}`, padding: "31px 38px" }}>
          <div style={{ color: cobalt, fontSize: 31, fontWeight: 700 }}>Independent verification</div>
          <div style={{ fontSize: 42, fontWeight: 650, letterSpacing: "-.05em", lineHeight: 1.04, marginTop: 23 }}>Checks the program against the signed limits before review.</div>
        </div>
      </div>
    </div>
  </Scene>;
};

const EndCard = () => {
  const frame = useCurrentFrame();
  return <Scene>
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", left: 0, position: "absolute", right: 0, textAlign: "center", top: 224, ...rise(frame, 8) }}>
      <CobiaMark size={93} />
      <div style={{ fontSize: 126, fontWeight: 700, letterSpacing: "-.08em", lineHeight: .84, marginTop: 40 }}>AI proposes.<br /><span style={{ color: cobalt }}>Cobia verifies.</span><br />Your wallet decides.</div>
      <div style={{ background: navy, color: "white", fontSize: 31, fontWeight: 700, marginTop: 51, padding: "18px 30px" }}>getcobia.com</div>
    </div>
  </Scene>;
};

export const AnalyticsLaunchTrailer = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={150}><Intro /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: 18 })} />
    <TransitionSeries.Sequence durationInFrames={150}><Intent /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={flip({ direction: "from-bottom", perspective: 900 })} timing={linearTiming({ durationInFrames: 22 })} />
    <TransitionSeries.Sequence durationInFrames={180}><Solver /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={clockWipe({ width: 1920, height: 1080 })} timing={linearTiming({ durationInFrames: 18 })} />
    <TransitionSeries.Sequence durationInFrames={160}><Receipt /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={wipe({ direction: "from-top-right" })} timing={linearTiming({ durationInFrames: 22 })} />
    <TransitionSeries.Sequence durationInFrames={160}><EndCard /></TransitionSeries.Sequence>
  </TransitionSeries>
);
