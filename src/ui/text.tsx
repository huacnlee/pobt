import { split, Text as NshText, type TextProps } from "nsh";

export type TextVariant = "display" | "title" | "heading" | "body" | "label" | "caption" | "mono";
export type TextTone = "default" | "muted" | "primary" | "warning" | "positive" | "negative" | "up" | "down" | "destructive";

const VARIANT: Record<TextVariant, string> = {
  display: "font-display text-2xl tracking-wide",
  title: "font-display text-lg tracking-wide",
  heading: "text-sm font-semibold",
  body: "text-sm",
  label: "text-xs font-medium",
  caption: "text-xs",
  mono: "font-mono text-xs",
};

const TONE: Record<TextTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary",
  warning: "text-warning",
  positive: "text-positive",
  negative: "text-negative",
  // the market's rises and falls: up is red, down is green
  up: "text-up",
  down: "text-down",
  destructive: "text-destructive",
};

/** Text in POBT's type scale: `variant` for its role, `tone` for its meaning. */
export function Text(props: TextProps & { variant?: TextVariant; tone?: TextTone }) {
  const [own, rest] = split(props, ["variant", "tone", "class", "children"]);
  // children passed on explicitly: spread from `split`, they do not reach the text
  return (
    <NshText {...rest} class={`${VARIANT[own.variant ?? "body"]} ${TONE[own.tone ?? "default"]} ${own.class ?? ""}`}>
      {own.children}
    </NshText>
  );
}
