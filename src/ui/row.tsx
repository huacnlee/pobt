// A pressable row of a list or table: hover washes it, a press deepens it, the selected one stays lit, the keyboard's
// ring shows on focus; no scale.
import type { JSX } from "nsh";
import { Button } from "nsh/base";
import { WASH } from "./motion";

/** `choose`: a row that is chosen rather than pressed (a list's selection) is chosen as the pointer goes down, so the
 * choice shows at once; the keyboard (and a screen reader) choose it as a press. Otherwise only a whole press (down and
 * up on it) counts. */
export function Row(props: {
  onPress?: () => void;
  children?: JSX.Element;
  label?: string;
  hint?: string;
  selected?: boolean;
  choose?: boolean;
  class?: string;
  testID?: string;
}) {
  // the press that went down already chose: its release does not choose again
  let chose = false;
  return (
    <Button
      selected={props.selected}
      onPressDown={() => {
        if (!props.choose) return;
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
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      testID={props.testID}
      class={`min-h-8 flex-row items-center gap-3 rounded-sm px-2.5 py-1.5 ${WASH} hover:bg-accent/60 active:bg-accent selected:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${props.class ?? ""}`}
    >
      {props.children}
    </Button>
  );
}
