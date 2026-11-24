import type { JSX } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { WASH } from "./motion";

/** A row of a list that can be chosen: hover washes it, the chosen one stays lit, the keyboard's ring shows on focus.
 * A pointer chooses it as it goes down, so the choice shows at once; the keyboard (and a screen reader) as a press.
 * `pressOnRelease`: only a whole press (down and up on it) counts, for a row whose press does something (equips,
 * allocates) rather than choosing. */
export function ListRow(props: {
  selected?: boolean;
  onPress?: () => void;
  pressOnRelease?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  class?: string;
  children?: JSX.Element;
}) {
  // the press that went down already chose: its release does not choose again
  let chose = false;
  return (
    <BaseButton
      selected={props.selected}
      onPressDown={() => {
        if (props.pressOnRelease) return;
        chose = true;
        props.onPress?.();
      }}
      onPressUp={() => {
        // after the press it ends (if it ends one), so a press moved away does not swallow the next
        setTimeout(() => (chose = false), 0);
      }}
      onPress={() => {
        if (chose) {
          chose = false;
          return;
        }
        props.onPress?.();
      }}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      class={`min-h-8 flex-row items-center gap-2 rounded-sm px-2.5 ${WASH} hover:bg-accent/60 active:bg-accent selected:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${props.class ?? ""}`}
    >
      {props.children}
    </BaseButton>
  );
}
