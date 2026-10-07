// Chart palette, from DESIGN.md §8 "Charts", validated with the dataviz skill's
// validate_palette.js (light surface). Teal is nudged from #349780 to #13987C to
// clear the chroma floor; order blue → orange → teal → violet → pink passes
// adjacent-pair CVD separation. Orange is below 3:1 contrast, so every chart
// that uses it carries a legend, tooltip and table view.
export const C = {
  blue: "#3143E5",
  orange: "#E58F10",
  teal: "#13987C",
  violet: "#7A53F8",
  pink: "#DF2664",
  neutral: "#BDBEC1",
  ink: "#1B1B1D",
  inkSoft: "#4E4F55",
  grid: "#F0F0F1",
  axis: "#85868E",
  blueWash: "#3143E5",
  blueLight: "#98A1F2",
  blueTint: "#CBD0F8",
} as const;

export const SERIES = [C.blue, C.orange, C.teal, C.violet, C.pink] as const;

// Score ramp (DESIGN.md §2.5), used for cohort retention heat cells.
export const SCORE_RAMP = [
  { min: 0.9, color: "#2E9E5B", label: "90%+" },
  { min: 0.8, color: "#5BA84F", label: "80–90%" },
  { min: 0.7, color: "#A8C13C", label: "70–80%" },
  { min: 0.5, color: "#F5A623", label: "50–70%" },
  { min: -Infinity, color: "#EF4444", label: "<50%" },
] as const;

export function scoreColor(v: number) {
  return SCORE_RAMP.find((s) => v >= s.min)!.color;
}

/** Pick white or ink text for a filled background. */
export function textOn(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#1B1B1D" : "#FFFFFF";
}

export const axisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "#DCDDDF" },
} as const;

export const yAxisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
  width: 56,
} as const;
