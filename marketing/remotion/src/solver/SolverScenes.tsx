import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CobiaBrand, CobiaMark } from "../brand/CobiaBrand";

const cobalt = "#3753ff";
const ink = "#101936";
const paper = "#f7f8fc";
const line = "#d9deec";

const enter = (frame: number, from: number, distance = 38) => ({
  opacity: interpolate(frame, [from, from + 16], [0, 1], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  translate: `${interpolate(frame, [from, from + 16], [-distance, 0], {
    easing: Easing.bezier(.16, 1, .3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px 0px`,
});

const Stage = ({ children }: { readonly children: React.ReactNode }) => (
  <AbsoluteFill style={{ background: paper, color: ink, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", overflow: "hidden" }}>
    <div style={{ backgroundImage: "linear-gradient(rgba(55,83,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(55,83,255,.06) 1px, transparent 1px)", backgroundSize: "72px 72px", inset: 0, position: "absolute" }} />
    <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.18), transparent 68%)", height: 980, position: "absolute", right: -330, top: -470, width: 980 }} />
    <header style={{ left: 84, position: "absolute", top: 54 }}><CobiaBrand compact /></header>
    {children}
  </AbsoluteFill>
);

const Pill = ({ children, active = false }: { readonly active?: boolean; readonly children: string }) => (
  <span style={{ background: active ? cobalt : "#e8ebff", borderRadius: 99, color: active ? "white" : cobalt, display: "inline-block", fontSize: 32, fontWeight: 720, padding: "11px 18px 13px" }}>{children}</span>
);

export const BetterRouteHook = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Solver hook" style={{ fontSize: 150, fontWeight: 750, left: 118, letterSpacing: "-.085em", lineHeight: .84, position: "absolute", top: 230, width: 1560, ...enter(frame, 2) }}>
      Got a better route?<br /><span style={{ color: cobalt }}>Prove it.</span>
    </Interactive.Div>
  </Stage>;
};

export const CompetitionBoard = () => {
  const frame = useCurrentFrame();
  const proposals = [
    { name: "route_01", result: "eligible", tone: "plain" },
    { name: "route_02", result: "best outcome", tone: "winner" },
    { name: "route_03", result: "rejected", tone: "rejected" },
  ] as const;
  return <Stage>
    <Interactive.Div name="Competition title" style={{ fontSize: 101, fontWeight: 750, left: 118, letterSpacing: "-.075em", lineHeight: .9, position: "absolute", top: 168, ...enter(frame, 2) }}>
      Same policy.<br />Different programs.
    </Interactive.Div>
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(3, 1fr)", left: 118, position: "absolute", right: 118, top: 535 }}>
      {proposals.map((proposal, index) => {
        const winner = proposal.tone === "winner";
        return <Interactive.Div key={proposal.name} name={`Proposal ${index + 1}`} style={{ background: winner ? ink : "white", border: `3px solid ${proposal.tone === "rejected" ? "#c8ccda" : ink}`, borderRadius: 25, color: winner ? "white" : ink, minHeight: 265, padding: "30px 31px", ...enter(frame, 17 + index * 11, 28) }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "monospace", fontSize: 31, fontWeight: 700 }}>{proposal.name}</span>
            <span style={{ color: winner ? "#aebaff" : cobalt, fontSize: 35 }}>→</span>
          </div>
          <div style={{ fontSize: 49, fontWeight: 740, letterSpacing: "-.055em", lineHeight: .95, marginTop: 76 }}>{proposal.result}</div>
        </Interactive.Div>;
      })}
    </div>
  </Stage>;
};

export const SearchFreelyHook = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Search hook" style={{ fontSize: 151, fontWeight: 750, left: 118, letterSpacing: "-.09em", lineHeight: .82, position: "absolute", top: 225, width: 1620, ...enter(frame, 2) }}>
      Search freely.<br /><span style={{ color: cobalt }}>Hold no wallet keys.</span>
    </Interactive.Div>
  </Stage>;
};

export const SolverBoundary = () => {
  const frame = useCurrentFrame();
  const steps = [
    { title: "Your solver", detail: "search + propose" },
    { title: "Cobia", detail: "verify exact calls" },
    { title: "Owner wallet", detail: "review + approve" },
  ];
  return <Stage>
    <Interactive.Div name="Boundary title" style={{ fontSize: 94, fontWeight: 750, left: 118, letterSpacing: "-.075em", lineHeight: .9, position: "absolute", top: 165, ...enter(frame, 2) }}>
      Creativity stays open.<br />Authority stays closed.
    </Interactive.Div>
    <div style={{ alignItems: "stretch", display: "grid", gap: 52, gridTemplateColumns: "1fr 1fr 1fr", left: 118, position: "absolute", right: 118, top: 540 }}>
      {steps.map((step, index) => <Interactive.Div key={step.title} name={step.title} style={{ background: index === 1 ? cobalt : "white", border: `3px solid ${index === 1 ? cobalt : ink}`, borderRadius: 25, color: index === 1 ? "white" : ink, minHeight: 260, padding: "34px 32px", position: "relative", ...enter(frame, 18 + index * 12, 28) }}>
        <div style={{ alignItems: "center", background: index === 1 ? "white" : ink, borderRadius: "50%", color: index === 1 ? cobalt : "white", display: "flex", fontSize: 31, fontWeight: 740, height: 60, justifyContent: "center", width: 60 }}>{index + 1}</div>
        <div style={{ fontSize: 48, fontWeight: 750, letterSpacing: "-.055em", marginTop: 36 }}>{step.title}</div>
        <div style={{ color: index === 1 ? "#e2e6ff" : "#5b6278", fontSize: 32, fontWeight: 620, marginTop: 15 }}>{step.detail}</div>
        {index < 2 ? <div style={{ color: cobalt, fontSize: 54, fontWeight: 760, position: "absolute", right: -43, top: 97 }}>→</div> : null}
      </Interactive.Div>)}
    </div>
  </Stage>;
};

export const ReputationHook = () => {
  const frame = useCurrentFrame();
  return <Stage>
    <Interactive.Div name="Reputation hook" style={{ fontSize: 146, fontWeight: 750, left: 118, letterSpacing: "-.087em", lineHeight: .83, position: "absolute", top: 224, width: 1640, ...enter(frame, 2) }}>
      Good solvers<br /><span style={{ color: cobalt }}>leave evidence.</span>
    </Interactive.Div>
  </Stage>;
};

export const PublicRecord = () => {
  const frame = useCurrentFrame();
  const records = ["Accepted programs", "Rejections", "Wins", "Evidence links"];
  return <Stage>
    <Interactive.Div name="Record title" style={{ fontSize: 96, fontWeight: 750, left: 118, letterSpacing: "-.075em", lineHeight: .9, position: "absolute", top: 164, ...enter(frame, 2) }}>
      Build an inspectable<br />solver record.
    </Interactive.Div>
    <Interactive.Div name="Solver profile" style={{ background: "white", border: `3px solid ${ink}`, borderRadius: 30, bottom: 104, boxShadow: "16px 16px 0 rgba(55,83,255,.14)", left: 118, padding: "31px 36px", position: "absolute", right: 118, ...enter(frame, 17, 28) }}>
      <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
        <div style={{ alignItems: "center", background: cobalt, borderRadius: 18, display: "flex", height: 78, justifyContent: "center", width: 78 }}><CobiaMark color="white" size={56} /></div>
        <div style={{ fontSize: 47, fontWeight: 750, letterSpacing: "-.055em" }}>Your solver profile</div>
        <div style={{ marginLeft: "auto" }}><Pill active>verifier-derived</Pill></div>
      </div>
      <div style={{ borderTop: `2px solid ${line}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginTop: 28 }}>
        {records.map((record, index) => <div key={record} style={{ borderRight: index < records.length - 1 ? `2px solid ${line}` : undefined, fontSize: 34, fontWeight: 690, lineHeight: 1.05, minHeight: 126, padding: "34px 24px 24px", ...enter(frame, 28 + index * 8, 18) }}>{record}</div>)}
      </div>
    </Interactive.Div>
  </Stage>;
};

export const SolverEnd = ({ line }: { readonly line: string }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: ink, color: "white", fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", overflow: "hidden" }}>
    <Interactive.Div name="End mark" style={{ alignItems: "center", background: cobalt, borderRadius: 24, display: "flex", height: 104, justifyContent: "center", left: 118, position: "absolute", top: 180, width: 104, ...enter(frame, 2) }}><CobiaMark color="white" size={76} /></Interactive.Div>
    <Interactive.Div name="End line" style={{ fontSize: 105, fontWeight: 750, left: 118, letterSpacing: "-.078em", lineHeight: .86, position: "absolute", top: 339, width: 1570, ...enter(frame, 14) }}>{line}</Interactive.Div>
    <Interactive.Div name="Solver CTA" style={{ alignItems: "center", background: "white", bottom: 86, color: ink, display: "flex", fontSize: 39, fontWeight: 730, gap: 18, left: 118, padding: "18px 25px", position: "absolute", ...enter(frame, 30) }}><span>Build a solver</span><span style={{ color: cobalt }}>→</span><span>getcobia.com/docs/quickstart</span></Interactive.Div>
  </AbsoluteFill>;
};
