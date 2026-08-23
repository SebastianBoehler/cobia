import {
  AbsoluteFill, Easing, Interactive, interpolate,
  useCurrentFrame,
} from "remotion";
import { CobiaBrand } from "../brand/CobiaBrand";
import { CobiaSoundDesign } from "../shared/CobiaSoundDesign";
import { ArrowUpIcon, Stage } from "../shared/Stage";

const assets = [
  { tag: "@USDG", detail: "X Layer asset" },
  { tag: "@USDt0", detail: "X Layer asset" },
  { tag: "@OKB", detail: "Wallet asset" },
  { tag: "@aXlrUSDG", detail: "Wallet asset" },
  { tag: "@Aave", detail: "Protocol" },
  { tag: "@USDG", detail: "X Layer asset" },
] as const;

const CheckIcon = () => (
  <svg aria-hidden="true" height="27" viewBox="0 0 24 24" width="27">
    <path d="m5.5 12.5 4 4 9-9" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
  </svg>
);

const TagPill = ({ children, active = false }: { readonly active?: boolean; readonly children: React.ReactNode }) => (
  <span style={{
    backgroundColor: active ? "rgba(55,83,255,.16)" : "rgba(55,83,255,.10)",
    border: active ? "1px solid rgba(55,83,255,.28)" : "1px solid transparent",
    borderRadius: 10,
    color: "#3650ee",
    display: "inline-block",
    fontWeight: 720,
    padding: "1px 7px 3px",
  }}>{children}</span>
);

export const TagPickerClip = () => {
  const frame = useCurrentFrame();
  const scrollIndex = interpolate(frame, [48, 62, 78, 94, 110, 126, 146], [0, 0, 1, 2, 3, 4, 5], {
    easing: [Easing.linear, Easing.bezier(.65, 0, .35, 1), Easing.bezier(.65, 0, .35, 1), Easing.bezier(.65, 0, .35, 1), Easing.bezier(.65, 0, .35, 1), Easing.bezier(.65, 0, .35, 1)],
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const selected = assets[Math.round(scrollIndex)] ?? assets[0];
  const pickerOpen = frame >= 28 && frame < 166;
  const sent = frame >= 220;

  return (
    <Stage>
      <header style={{ left: 84, position: "absolute", top: 54 }}><CobiaBrand compact /></header>
      <AbsoluteFill style={{ alignItems: "center", display: "flex", justifyContent: "center" }}>

      <Interactive.Div name="Intent prompt" style={{
        backgroundColor: "white", border: "1px solid #d8dce5", borderRadius: 30,
        boxShadow: "0 32px 90px rgba(17,20,26,.15)", display: "flex", flexDirection: "column",
        height: 350, justifyContent: "space-between", opacity: interpolate(frame, [0, 12, 254, 268], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        padding: "42px 44px 34px", position: "relative",
        scale: interpolate(frame, [0, 15, 28], [.86, 1.04, 1], { easing: [Easing.spring({ damping: 105 }), Easing.spring({ damping: 155 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
        translate: interpolate(frame, [0, 15, 28, 205, 216, 228], ["0px 64px", "0px -12px", "0px 0px", "0px 0px", "0px -10px", "0px 0px"], { easing: [Easing.spring({ damping: 110 }), Easing.spring({ damping: 160 }), Easing.linear, Easing.spring({ damping: 125 }), Easing.spring({ damping: 170 })], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        width: 1480,
      }}>
        <Interactive.Div name="Intent with selected tag" style={{ fontSize: 54, fontWeight: 600, letterSpacing: "-.04em", lineHeight: 1.35, minHeight: 155 }}>
          Swap 10{" "}
          <span style={{ display: "inline-block", scale: interpolate(frame, [146, 156, 170], [1, 1.13, 1], { easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 160 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}>
            <TagPill active={pickerOpen}>{selected.tag}</TagPill>
          </span>{" "}
          into at least 9.95 <TagPill>@USDt0</TagPill> on <TagPill>@XLayer</TagPill>
        </Interactive.Div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {["Any action", "@ Mention", "Routes"].map((item) => <span key={item} style={{ background: "#f1f3f7", borderRadius: 999, color: "#20242d", fontSize: 18, padding: "11px 18px" }}>{item}</span>)}
          </div>
          <Interactive.Div name="Send intent" style={{
            alignItems: "center", backgroundColor: sent ? "#3753ff" : frame >= 174 ? "#11141a" : "#b4b7bd",
            borderRadius: "50%", boxShadow: sent ? "0 0 0 12px rgba(55,83,255,.12)" : "0 0 0 0 rgba(55,83,255,0)",
            display: "flex", height: 62, justifyContent: "center", overflow: "hidden", position: "relative",
            scale: interpolate(frame, [204, 214, 222, 234], [1, 1.1, .82, 1], { easing: [Easing.spring({ damping: 120 }), Easing.spring({ damping: 110 }), Easing.spring({ damping: 150 })], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }), width: 62,
          }}>
            <div style={{ opacity: interpolate(frame, [214, 224], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: interpolate(frame, [214, 224], ["0px 0px", "0px -32px"], { easing: Easing.bezier(.16, 1, .3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><ArrowUpIcon size={29} /></div>
            <div style={{ opacity: interpolate(frame, [223, 233], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), position: "absolute", scale: interpolate(frame, [223, 236], [.65, 1], { easing: Easing.spring({ damping: 140 }), extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }) }}><CheckIcon /></div>
          </Interactive.Div>
        </div>
      </Interactive.Div>

      <Interactive.Div name="Asset picker" style={{
        backgroundColor: "rgba(255,255,255,.96)", border: "1px solid #d8dce5", borderRadius: 22,
        boxShadow: "0 24px 70px rgba(17,20,26,.16)", height: 330, left: 430,
        opacity: interpolate(frame, [26, 40, 152, 166], [0, 1, 1, 0], { easing: [Easing.bezier(.16, 1, .3, 1), Easing.linear, Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        overflow: "hidden", padding: "18px 18px 14px", position: "absolute",
        scale: interpolate(frame, [26, 42, 152, 166], [.9, 1, 1, .92], { easing: [Easing.spring({ damping: 150 }), Easing.bezier(.7, 0, .84, 0), Easing.bezier(.7, 0, .84, 0)], extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" }),
        top: 185, transformOrigin: "bottom center", width: 470,
      }}>
        <div style={{ color: "#101936", fontSize: 24, fontWeight: 700, margin: "0 10px 12px" }}>Choose the exact object</div>
        <div style={{ height: 242, overflow: "hidden", position: "relative" }}>
          <div style={{ background: "rgba(55,83,255,.09)", border: "1px solid rgba(55,83,255,.14)", borderRadius: 13, height: 58, left: 0, position: "absolute", right: 0, top: 73 }} />
          <div style={{ position: "absolute", top: 76, translate: `0px ${-scrollIndex * 58}px`, width: "100%" }}>
            {assets.map((asset, index) => {
              const distance = Math.abs(scrollIndex - index);
              return <div key={`${asset.tag}-${index}`} style={{ alignItems: "center", display: "flex", height: 58, justifyContent: "space-between", opacity: Math.max(.24, 1 - distance * .45), padding: "0 14px", scale: Math.max(.94, 1 - distance * .025) }}>
                <strong style={{ color: "#3650ee", fontSize: 27 }}>{asset.tag}</strong>
                <small style={{ color: "#747b89", fontSize: 17 }}>{asset.detail}</small>
              </div>;
            })}
          </div>
        </div>
      </Interactive.Div>

      </AbsoluteFill>
      <CobiaSoundDesign cues={[{ file: "orbit.wav", frame: 30 }, { file: "slide.wav", frame: 146 }, { file: "resolve.wav", frame: 218, volume: .68 }]} />
    </Stage>
  );
};
