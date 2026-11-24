// Path of Building's tooltip lines, compact, for every page (gems, passives, items, options): POB's own lines with
// their colour codes, each translated whole. POB's large font (a name) is a small bold heading, every other line the
// smallest text, set tight, so a long tooltip fits on screen as POB's does.
import { View } from "nsh";
import { Divider } from "../ui";
import { ColoredText } from "./ColoredText";

/** One of POB's tooltip lines: text (with `^` colour codes) at POB's font size, or a rule. */
export type TipLine = { text?: string; size?: number; sep?: boolean };

/** POB's lines without the rules at either end. */
function trimmed(lines: TipLine[]) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a]!.sep) a++;
  while (b > a && lines[b - 1]!.sep) b--;
  return lines.slice(a, b);
}

const lineClass = (size: number | undefined) => ((size ?? 16) >= 20 ? "text-sm font-semibold leading-snug" : "text-xs leading-tight");

/** POB's tooltip lines; `center` as POB centres a gem's. */
export function TipLines(props: { lines: TipLine[]; center?: boolean; class?: string }) {
  return (
    <View class={`${props.center ? "items-center" : ""} ${props.class ?? ""}`}>
      <Each of={trimmed(props.lines)}>
        {(line) => (
          <If when={!line().sep} else={<Divider class="my-0.5 self-stretch" />}>
            <ColoredText text={line().text ?? ""} class={`${props.center ? "text-center" : ""} ${lineClass(line().size)}`} />
          </If>
        )}
      </Each>
    </View>
  );
}
