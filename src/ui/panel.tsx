import { type JSX, View } from "nsh";
import { Text } from "./text";

/** A section of a page: a card with an optional title row (and actions at its end). */
export function Panel(props: { title?: string; actions?: JSX.Element; class?: string; children?: JSX.Element }) {
  return (
    <View class={`rounded-(--radius) border border-border bg-card ${props.class ?? ""}`}>
      <If when={props.title || props.actions}>
        <View class="h-9 flex-row items-center gap-2 border-b border-border px-3">
          <Text variant="heading" class="flex-1 truncate">
            {props.title ?? ""}
          </Text>
          {props.actions}
        </View>
      </If>
      {props.children}
    </View>
  );
}

/** A thin rule between groups. */
export function Divider(props: { class?: string }) {
  return <View class={`h-px bg-border ${props.class ?? ""}`} />;
}

/** A small label of a state or kind. */
export function Badge(props: { label: string; tone?: "default" | "primary" | "warning" | "destructive" }) {
  const box = () =>
    ({ default: "bg-muted border-border", primary: "bg-primary/15 border-primary/40", warning: "bg-warning/15 border-warning/40", destructive: "bg-destructive/15 border-destructive/40" })[
      props.tone ?? "default"
    ];
  const tone = () => (({ default: "muted", primary: "primary", warning: "warning", destructive: "destructive" }) as const)[props.tone ?? "default"];
  return (
    <View class={`h-5 justify-center rounded-full border px-2 ${box()}`}>
      <Text variant="label" tone={tone()} class="truncate">
        {props.label}
      </Text>
    </View>
  );
}

/** What a page shows with nothing to show yet. */
export function EmptyState(props: { title: string; detail?: string; children?: JSX.Element }) {
  return (
    <View class="flex-1 items-center justify-center gap-2 p-8">
      <Text variant="title">{props.title}</Text>
      <If when={props.detail}>
        <Text tone="muted" class="max-w-md text-center">
          {props.detail}
        </Text>
      </If>
      {props.children}
    </View>
  );
}
