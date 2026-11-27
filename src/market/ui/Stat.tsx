// A key number and a change, as the market shows them: up is red, down is green (DESIGN.md "Market").
import { Text, View } from "nsh";
import { Icon } from "../../ui";
import { percent as fmtPercent } from "./format";

/** One key number with its label. */
export function Stat(props: { label: string; value: string; tone?: "up" | "down" | "foreground"; hint?: string }) {
  const color = () => (props.tone === "up" ? "text-up" : props.tone === "down" ? "text-down" : "text-foreground");
  return (
    <View class="gap-1">
      <Text class="text-xs font-medium text-muted-foreground">{props.label}</Text>
      <Text class={`text-xl font-semibold tabular-nums ${color()}`}>{props.value}</Text>
      <If when={props.hint}>
        <Text class="text-xs text-muted-foreground">{props.hint}</Text>
      </If>
    </View>
  );
}

/** A change, colored and signed, with its trend icon: up is red, down is green. */
export function Change(props: { value: number | undefined; size?: "sm" | "md" }) {
  const dir = () => (props.value === undefined || Math.abs(props.value) < 0.05 ? 0 : props.value > 0 ? 1 : -1);
  return (
    <View class="flex-row items-center justify-end gap-1">
      <If when={dir() !== 0}>
        <Icon name={dir() > 0 ? "trending-up" : "trending-down"} size="sm" tone={dir() > 0 ? "up" : "down"} />
      </If>
      <Text
        class={`tabular-nums ${props.size === "md" ? "text-base font-semibold" : "text-sm"} ${
          dir() > 0 ? "text-up" : dir() < 0 ? "text-down" : "text-muted-foreground"
        }`}
      >
        {fmtPercent(props.value)}
      </Text>
    </View>
  );
}
