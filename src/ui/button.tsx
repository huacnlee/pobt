import { type JSX, Text } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { PRESS, WASH } from "./motion";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, { box: string; text: string }> = {
  // The launcher's red banner: dark red, lit from above, in gold trim; its label in the display face.
  primary: {
    box: "border border-trim-hi bg-linear-to-b from-banner-hi to-banner hover:border-gold hover:from-banner-hi hover:to-banner-hi/80 active:from-banner active:to-banner",
    text: "font-display font-semibold tracking-wide text-banner-foreground",
  },
  secondary: { box: "border border-border bg-secondary hover:bg-accent active:bg-accent/80", text: "text-secondary-foreground" },
  ghost: { box: "hover:bg-accent active:bg-accent/80", text: "text-foreground" },
  destructive: { box: "border border-destructive/40 hover:bg-destructive/15 active:bg-destructive/25", text: "text-destructive" },
};

const SIZE: Record<ButtonSize, { box: string; text: string }> = {
  sm: { box: "h-7 px-2.5 gap-1.5", text: "text-xs" },
  md: { box: "h-7 px-3 gap-1.5", text: "text-sm" },
};

/** POBT's button: a label (or `children`), in a variant and a size; `busy` shows it working and takes no presses. */
export function Button(props: {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  tooltip?: string;
  class?: string;
  children?: JSX.Element;
  onPress?: () => void;
}) {
  const v = () => VARIANT[props.variant ?? "secondary"];
  const s = () => SIZE[props.size ?? "md"];
  return (
    <BaseButton
      disabled={props.disabled || props.busy}
      busy={props.busy}
      selected={props.selected}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      tooltip={props.tooltip}
      onPress={props.onPress}
      class={`flex-row items-center justify-center rounded-(--radius) ${s().box} ${v().box} ${WASH} ${PRESS} disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring ${props.class ?? ""}`}
    >
      {props.children}
      <If when={props.label}>
        <Text class={`${s().text} font-medium truncate ${v().text}`}>
          {props.busy ? "…" : props.label}
        </Text>
      </If>
    </BaseButton>
  );
}
