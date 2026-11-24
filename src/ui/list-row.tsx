import type { JSX } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { WASH } from "./motion";

/** A row of a list that can be chosen: hover washes it, the chosen one stays lit, the keyboard's ring shows on focus. */
export function ListRow(props: {
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  class?: string;
  children?: JSX.Element;
}) {
  return (
    <BaseButton
      selected={props.selected}
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      class={`min-h-8 flex-row items-center gap-2 rounded-sm px-2.5 ${WASH} hover:bg-accent/60 active:bg-accent selected:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${props.class ?? ""}`}
    >
      {props.children}
    </BaseButton>
  );
}
