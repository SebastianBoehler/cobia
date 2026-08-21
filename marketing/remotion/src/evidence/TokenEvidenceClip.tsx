import { Audio } from "@remotion/media";
import {
  AbsoluteFill, Easing, Interactive, interpolate, Sequence, staticFile,
  useCurrentFrame,
} from "remotion";
import { ArrowUpIcon } from "../shared/Stage";

const tagOne = "@WETH";
const middleOne = " into at least 2,390 ";
const tagTwo = "@USDt0";
const middleTwo = " on ";
const tagThree = "@XLayer";

const typed = (frame: number, text: string, start: number, end: number) => text.slice(0, Math.floor(interpolate(
  frame, [start, end], [0, text.length], { easing: Easing.bezier(.3, 0, .2, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" },
)));

const Tag = ({ children, active = false }: { readonly active?: boolean; readonly children: string }) => <strong style={{
  background: active ? "rgba(111,137,255,.2)" : "rgba(111,137,255,.12)", borderRadius: 5,
  color: "#8da3ff", fontWeight: 630, padding: "1px 4px 2px",
}}>{children}</strong>;

const Check = () => <svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22"><path d="m5.5 12.5 4 4 9-9" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" /></svg>;

function Typeahead({ tag, detail, price, start, end, left }: {
  readonly detail: string; readonly end: number; readonly left: number; readonly price?: string; readonly start: number; readonly tag: string;
}) {
  const frame = useCurrentFrame();
  return <Interactive.Div name={`${tag} typeahead`} style={{
    background: "#20252e", border: "1px solid #343d4b", borderRadius: 14, boxShadow: "0 16px 44px rgba(0,0,0,.36)", left,
    opacity: interpolate(frame, [start, start + 9, end - 8, end], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    padding: 6, position: "absolute", scale: interpolate(frame, [start, start + 10, end], [.93, 1, .95], { easing: [Easing.spring({ damping: 150 }), Easing.linear], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), top: 104, transformOrigin: "top left", width: 360,
  }}>
    <div style={{ alignItems: "center", background: "rgba(111,137,255,.12)", borderRadius: 9, display: "grid", gap: 12, gridTemplateColumns: price ? "auto minmax(0, 1fr) auto" : "auto minmax(0, 1fr)", minHeight: 48, padding: "9px 10px" }}>
      <strong style={{ color: "#8da3ff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>{tag}</strong>
      {price ? <code style={{ color: "#a8b0be", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}>{detail}</code> : <small style={{ color: "#a8b0be", fontSize: 12 }}>{detail}</small>}
      {price ? <b style={{ color: "#eef0f4", fontSize: 12 }}>{price}</b> : null}
    </div>
  </Interactive.Div>;
}

export const TokenEvidenceClip = () => {
  const frame = useCurrentFrame();
  const oneSelected = frame >= 86;
  const twoSelected = frame >= 166;
  const threeSelected = frame >= 244;
  const sent = frame >= 292;
  const firstTag = typed(frame, tagOne, 20, 54);
  const firstMiddle = oneSelected ? typed(frame, middleOne, 88, 121) : "";
  const secondTag = oneSelected ? typed(frame, tagTwo, 121, 143) : "";
  const secondMiddle = twoSelected ? typed(frame, middleTwo, 168, 191) : "";
  const thirdTag = twoSelected ? typed(frame, tagThree, 191, 214) : "";
  const cursor = !threeSelected && frame % 16 < 9;

  return <AbsoluteFill style={{ alignItems: "center", background: "#0d1014", color: "#f3f5f8", display: "flex", fontFamily: "Inter, Arial, sans-serif", justifyContent: "center", overflow: "hidden" }}>
    <div style={{ background: "radial-gradient(circle, rgba(55,83,255,.22), transparent 67%)", height: 960, position: "absolute", right: -280, top: -430, width: 960 }} />
    <div style={{ backgroundImage: "radial-gradient(rgba(152,166,197,.2) 1px, transparent 1px)", backgroundSize: "34px 34px", inset: 0, opacity: .3, position: "absolute" }} />

    <Interactive.Div name="Cobia intent prompt" style={{
      background: "#171b22", border: "1px solid #2b323d", borderRadius: 28, boxShadow: "0 28px 90px rgba(0,0,0,.38)", display: "flex", flexDirection: "column", height: 318,
      justifyContent: "space-between", opacity: interpolate(frame, [0, 12, 338, 358], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      padding: "28px 30px 22px", position: "relative", scale: interpolate(frame, [0, 16, 29], [.9, 1.03, 1], { easing: [Easing.spring({ damping: 110 }), Easing.spring({ damping: 165 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
      translate: interpolate(frame, [0, 16, 29, 280, 294, 308], ["0px 56px", "0px -9px", "0px 0px", "0px 0px", "0px -8px", "0px 0px"], { easing: [Easing.spring({ damping: 110 }), Easing.spring({ damping: 160 }), Easing.linear, Easing.spring({ damping: 125 }), Easing.spring({ damping: 170 })], extrapolateLeft: "clamp", extrapolateRight: "clamp" }), width: 1020,
    }}>
      <Interactive.Div name="Prompt text" style={{ color: "#eef0f4", fontSize: 29, letterSpacing: "-.025em", lineHeight: 1.45, minHeight: 155, padding: "5px 5px" }}>
        Swap 1 <Tag active={oneSelected}>{firstTag || "@"}</Tag>{oneSelected ? <>{firstMiddle}<Tag active={twoSelected}>{secondTag || "@"}</Tag></> : null}{twoSelected ? <>{secondMiddle}<Tag active={threeSelected}>{thirdTag || "@"}</Tag></> : null}{cursor ? <span style={{ color: "#dfe4ee" }}>|</span> : null}
      </Interactive.Div>

      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>{["Round trip⌄", "@  Mention", "⌘  Routes"].map((label) => <span key={label} style={{ background: "#1e232b", borderRadius: 999, color: "#d8dce5", fontSize: 13, padding: "10px 13px" }}>{label}</span>)}</div>
        <Interactive.Div name="Review policy" style={{
          alignItems: "center", background: sent ? "#617dff" : threeSelected ? "#f0f2f4" : "#4a505a", borderRadius: "50%", boxShadow: sent ? "0 0 0 10px rgba(97,125,255,.18)" : "none", color: "#101318", display: "flex", height: 48, justifyContent: "center", overflow: "hidden", position: "relative",
          scale: interpolate(frame, [280, 292, 300, 314], [1, 1.1, .82, 1], { easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 110 }), Easing.spring({ damping: 150 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), width: 48,
        }}>
          <div style={{ opacity: interpolate(frame, [290, 300], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [290, 300], ["0px 0px", "0px -28px"], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><ArrowUpIcon size={23} /></div>
          <div style={{ opacity: interpolate(frame, [299, 310], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), position: "absolute" }}><Check /></div>
        </Interactive.Div>
      </div>

      <Typeahead detail="0x5a77…c71c" end={86} left={124} price="$2,401.90" start={50} tag="@WETH" />
      <Typeahead detail="0x0c1a…26d4" end={166} left={454} price="$1.00" start={139} tag="@USDt0" />
      <Typeahead detail="Chain 196" end={244} left={640} start={210} tag="@XLayer" />
    </Interactive.Div>

    {[55, 143, 214].map((from) => <Sequence from={from} key={from} layout="none"><Audio playbackRate={1.65} src={staticFile("sfx/tag-chime-1.wav")} toneFrequency={1.2} volume={.32} /></Sequence>)}
    {[86, 166, 244].map((from) => <Sequence from={from} key={from} layout="none"><Audio playbackRate={1.3} src={staticFile("sfx/tag-chime-2.wav")} toneFrequency={1.1} volume={.44} /></Sequence>)}
    <Sequence from={292} layout="none"><Audio playbackRate={1.08} src={staticFile("sfx/send-chord.wav")} toneFrequency={1.04} volume={.5} /></Sequence>
  </AbsoluteFill>;
};
