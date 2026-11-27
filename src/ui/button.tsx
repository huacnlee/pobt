// Buttons: one look per variant, 28pt tall, on nsh/base's Button. The primary is the launcher's red banner in gold
// trim, its label in the display face; `default` (and `outline`, which draws as it) the bordered secondary.
import { type JSX, Text, View } from "nsh";
import { Button as BaseButton, type Placement, Tooltip } from "nsh/base";
import { Icon, type IconName, type Tone } from "./icon";
import { POPUP, POPUP_END, POPUP_START, PRESS, WASH } from "./motion";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "default" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const SECONDARY = { box: "border border-border bg-secondary hover:bg-accent active:bg-accent/80", text: "text-secondary-foreground", tone: "foreground" as Tone };

const VARIANT: Record<ButtonVariant, { box: string; text: string; tone: Tone }> = {
  primary: {
    box: "border border-trim-hi bg-linear-to-b from-banner-hi to-banner hover:border-gold hover:from-banner-hi hover:to-banner-hi/80 active:from-banner active:to-banner",
    text: "font-display font-semibold tracking-wide text-banner-foreground",
    tone: "banner",
  },
  default: SECONDARY,
  outline: SECONDARY,
  ghost: { box: "hover:bg-accent active:bg-accent/80", text: "text-foreground", tone: "foreground" },
  destructive: { box: "border border-destructive/40 hover:bg-destructive/15 active:bg-destructive/25", text: "text-destructive", tone: "destructive" },
};

const SIZE: Record<ButtonSize, { box: string; text: string }> = {
  sm: { box: "h-7 gap-1.5 px-2.5", text: "text-xs" },
  md: { box: "h-7 gap-1.5 px-3", text: "text-sm" },
};

/** A button: an icon and a label (or only an icon, its `tooltip` then saying what it does); `busy` turns a spinner
 * in place of the icon and takes no presses; `selected` keeps a toggle lit. */
export function Button(props: {
  label?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  selected?: boolean;
  tooltip?: string;
  accessibilityLabel?: string;
  class?: string;
  testID?: string;
}) {
  const v = () => VARIANT[props.variant ?? "default"];
  const s = () => SIZE[props.size ?? "md"];
  return (
    <BaseButton
      onPress={props.onPress}
      disabled={props.disabled || props.busy}
      busy={props.busy}
      selected={props.selected}
      accessibilityLabel={props.accessibilityLabel ?? props.label ?? props.tooltip}
      testID={props.testID}
      tooltip={props.tooltip ? <TooltipBubble text={props.tooltip} /> : undefined}
      class={`flex-row items-center justify-center rounded-(--radius) ${s().box} ${v().box} ${WASH} ${PRESS} selected:bg-accent disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring ${props.class ?? ""}`}
    >
      <If when={props.busy}>
        <Spinner size="sm" />
      </If>
      <If when={props.busy ? undefined : props.icon}>{(name) => <Icon name={name()} size="sm" tone={v().tone} />}</If>
      <If when={props.label}>
        <Text class={`${s().text} font-medium truncate ${v().text}`}>{props.label}</Text>
      </If>
      <If when={props.trailingIcon}>{(name) => <Icon name={name()} size="sm" tone={v().tone} />}</If>
    </BaseButton>
  );
}

/** A square ghost button with a well-known icon; its label is for screen readers and its hint. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: Tone;
  size?: ButtonSize;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}) {
  return (
    <BaseButton
      onPress={props.onPress}
      disabled={props.disabled}
      selected={props.selected}
      accessibilityLabel={props.label}
      testID={props.testID}
      tooltip={<TooltipBubble text={props.label} />}
      class={`items-center justify-center rounded-(--radius) hover:bg-accent active:bg-accent/80 selected:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${WASH} ${PRESS} ${
        props.size === "sm" ? "size-6" : "size-7"
      }`}
    >
      <Icon name={props.icon} size="sm" tone={props.tone ?? "muted"} />
    </BaseButton>
  );
}

/** A hint bubble, given as a view's `tooltip` (`<View tooltip={<Hint>…</Hint>}>`): it grows from its trigger after a
 * rest. `onOpen`: it is about to show (load what it says then). */
export function Hint(props: { placement?: Placement; delay?: number; onOpen?: () => void; children?: JSX.Element }) {
  return (
    <Tooltip
      delay={props.delay ?? 500}
      placement={props.placement ?? "top"}
      class={`max-w-96 gap-1 rounded-(--radius) border border-border bg-popover px-2.5 py-2 shadow-lg ${POPUP}`}
      startingClass={POPUP_START}
      endingClass={POPUP_END}
      onOpenChange={(e) => e.open && props.onOpen?.()}
    >
      {props.children}
    </Tooltip>
  );
}

/** The hint every icon button has: its label. */
export function TooltipBubble(props: { text: string }) {
  return (
    <Hint>
      <Text class="text-xs text-popover-foreground">{props.text}</Text>
    </Hint>
  );
}

/** A row of buttons that belong together. */
export function ButtonRow(props: { children: JSX.Element; class?: string }) {
  return <View class={`flex-row items-center gap-2 ${props.class ?? ""}`}>{props.children}</View>;
}
