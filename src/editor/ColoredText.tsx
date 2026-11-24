// Path of Building's coloured text: `^7`, `^xRRGGBB` (and go-pob's `^#RRGGBB`) switch the colour of what follows.
// The colours are POB's game data (rarity, damage type, stat colours), drawn as data, as in POB.
import { Text } from "nsh";
import { tr } from "./i18n";

const DIGITS: Record<string, string> = {
  "0": "#000000", "1": "#FF0000", "2": "#00FF00", "3": "#0000FF", "4": "#FFFF00",
  "5": "#FF00FF", "6": "#00FFFF", "7": "#FFFFFF", "8": "#B2B2B2", "9": "#666666",
};

export type Run = { text: string; color?: string };

/** `s` split into runs of one colour each. */
export function colorRuns(s: string): Run[] {
  const runs: Run[] = [];
  const re = /\^(?:x([0-9A-Fa-f]{6})|#([0-9A-Fa-f]{6})|([0-9]))/g;
  let color: string | undefined;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) runs.push({ text: s.slice(last, m.index), color });
    color = m[1] || m[2] ? `#${m[1] ?? m[2]}` : DIGITS[m[3]!];
    last = m.index! + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last), color });
  return runs;
}

/** POB text without its colour codes. */
export const plain = (s: string) => colorRuns(s).map((r) => r.text).join("");

/** A line of POB text in its colours (white, POB's default, as the theme's foreground), translated unless `raw`. */
export function ColoredText(props: { text: string; raw?: boolean; class?: string }) {
  const runs = () => colorRuns(props.raw ? props.text : tr(props.text));
  return (
    // The caller's size wins: two sizes in one class list would not say which applies.
    <Text class={`${/\btext-(xs|sm|base|lg|xl|\d?xl)\b/.test(props.class ?? "") ? "" : "text-sm "}text-foreground ${props.class ?? ""}`}>
      <Each of={runs()}>
        {(r) => <Text style={r().color && r().color !== "#FFFFFF" ? { color: r().color } : undefined}>{r().text}</Text>}
      </Each>
    </Text>
  );
}
