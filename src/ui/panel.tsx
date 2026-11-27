// Containers and marks: Card (a section of a page), Badge, Separator and a group's heading.
import { type JSX, Text, View } from "nsh";
import { Icon, type IconName, type Tone } from "./icon";

/** A section of a page: a card; with a `title`, a 36pt title row (and `actions` at its end) over its
 * content; the content is padded by `bodyClass` (default `p-3`; a list's rows take `p-1`, a page's own layout `p-0`). */
export function Card(props: { children: JSX.Element; title?: string; actions?: JSX.Element; class?: string; bodyClass?: string; testID?: string }) {
  return (
    <If
      when={props.title || props.actions}
      else={
        <View testID={props.testID} class={`rounded-(--radius) border border-border bg-card ${props.bodyClass ?? "p-3"} ${props.class ?? ""}`}>
          {props.children}
        </View>
      }
    >
      <View testID={props.testID} class={`rounded-(--radius) border border-border bg-card ${props.class ?? ""}`}>
        <View class="h-9 flex-row items-center gap-2 border-b border-border px-3">
          <Text role="header" class="flex-1 truncate text-sm font-semibold text-card-foreground">
            {props.title ?? ""}
          </Text>
          {props.actions}
        </View>
        <View class={props.bodyClass ?? "p-3"}>{props.children}</View>
      </View>
    </If>
  );
}

export type BadgeTone = "neutral" | "up" | "down" | "warning" | "primary" | "destructive";

const BADGE: Record<BadgeTone, { box: string; text: string; icon: Tone }> = {
  neutral: { box: "border-border bg-muted", text: "text-muted-foreground", icon: "muted" },
  up: { box: "border-up/40 bg-up/15", text: "text-up", icon: "up" },
  down: { box: "border-down/40 bg-down/15", text: "text-down", icon: "down" },
  warning: { box: "border-warning/40 bg-warning/15", text: "text-warning", icon: "warning" },
  primary: { box: "border-primary/40 bg-primary/15", text: "text-primary", icon: "primary" },
  destructive: { box: "border-destructive/40 bg-destructive/15", text: "text-destructive", icon: "destructive" },
};

/** A small pill naming a state or kind. */
export function Badge(props: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const b = () => BADGE[props.tone ?? "neutral"];
  return (
    <View class={`h-5 flex-row items-center gap-1 self-start rounded-full border px-2 ${b().box}`}>
      <If when={props.icon}>{(name) => <Icon name={name()} size="xs" tone={b().icon} />}</If>
      <Text class={`text-xs font-medium truncate ${b().text}`}>{props.label}</Text>
    </View>
  );
}

/** A thin rule between groups. */
export function Separator(props: { vertical?: boolean; class?: string }) {
  return <View class={`${props.vertical ? "w-px" : "h-px"} self-stretch bg-border ${props.class ?? ""}`} />;
}

/** A group of a page: its name as POBT's group labels (small, muted), then its content. */
export function Section(props: { title: string; actions?: JSX.Element; children: JSX.Element; class?: string }) {
  return (
    <View class={`gap-2 ${props.class ?? ""}`}>
      <View class="min-h-7 flex-row items-center justify-between gap-2">
        <Text role="header" class="text-xs font-medium text-muted-foreground">
          {props.title}
        </Text>
        {props.actions}
      </View>
      {props.children}
    </View>
  );
}
