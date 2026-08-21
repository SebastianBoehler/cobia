import { Interactive } from "remotion";

export const CobiaMark = ({ size = 48 }: { readonly size?: number }) => (
  <svg aria-hidden="true" height={size} viewBox="0 0 34 34" width={size}>
    <circle cx="5" cy="17" fill="#3753ff" r="3.1" />
    <circle cx="29" cy="17" fill="#3753ff" r="3.1" />
    <path d="M8 17C12 17 11 7 19 7c5.2 0 5.4 7.1 7 8.5" fill="none" stroke="#3753ff" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M8 17h18" fill="none" stroke="#3753ff" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M8 17c4 0 3 10 11 10 5.2 0 5.4-7.1 7-8.5" fill="none" stroke="#3753ff" strokeLinecap="round" strokeWidth="1.8" />
  </svg>
);

export const CobiaBrand = ({ compact = false }: { readonly compact?: boolean }) => (
  <Interactive.Div
    name="Cobia brand"
    style={{ alignItems: "center", color: "#11141a", display: "flex", gap: compact ? 14 : 18 }}
  >
    <CobiaMark size={compact ? 42 : 54} />
    <span style={{ fontSize: compact ? 29 : 38, fontWeight: 760, letterSpacing: ".19em" }}>COBIA</span>
  </Interactive.Div>
);
