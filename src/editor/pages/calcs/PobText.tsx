// A line of POB text in its colours, each coloured run translated on its own: breakdown lines such as
// "2463 ^8(base)" mix numbers with words the dictionary knows ("(base)"), which whole-line translation would miss.
import { Text } from "nsh";
import { colorRuns } from "../../ColoredText";
import { tr } from "../../i18n";

function trRun(text: string): string {
  const m = /^(\s*)(.*?)(\s*)$/s.exec(text);
  if (!m || !/[A-Za-z]/.test(m[2]!)) return text;
  return `${m[1]}${tr(m[2])}${m[3]}`;
}

const clamp = (n: number | undefined) => (n === 1 ? "truncate" : n ? `line-clamp-${n}` : "");

/** `text` in POB's colours (white as the theme's foreground); words translated run by run unless `raw`. */
export function PobText(props: { text: string; raw?: boolean; class?: string; numberOfLines?: number }) {
  const runs = () => colorRuns(props.text ?? "");
  return (
    <Text class={`${props.class ?? "text-xs text-foreground"} ${clamp(props.numberOfLines)}`}>
      <Each of={runs()}>
        {(r) => (
          <Text style={r().color && r().color !== "#FFFFFF" ? { color: r().color } : undefined}>{props.raw ? r().text : trRun(r().text)}</Text>
        )}
      </Each>
    </Text>
  );
}
