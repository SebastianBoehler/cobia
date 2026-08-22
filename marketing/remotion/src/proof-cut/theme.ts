import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

export const { fontFamily: geistSans } = loadGeist("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600", "700"],
});

export const { fontFamily: geistMono } = loadGeistMono("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600"],
});

export const colors = {
  cobalt: "#3753ff",
  cobaltDark: "#3049e8",
  cobaltWash: "#eef1ff",
  dark: "#10131a",
  darkLine: "#303744",
  darkMuted: "#aeb6c8",
  darkSurface: "#181c24",
  ink: "#11141a",
  line: "#d8dce5",
  muted: "#69707d",
  paper: "#f8f9fb",
  rejected: "#c94b40",
  surface: "#ffffff",
  verified: "#25835a",
} as const;
