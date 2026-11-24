import type { JSX } from "nsh";
import { Tooltip, type Placement } from "nsh/base";
import { POPUP, POPUP_END, POPUP_START } from "./motion";

/** A hint bubble, given as a view's `tooltip` (`<View tooltip={<Hint>…</Hint>}>`): it grows from its trigger.
 * `onOpen`: it is about to show (load what it says then). */
export function Hint(props: { placement?: Placement; onOpen?: () => void; children?: JSX.Element }) {
  return (
    <Tooltip
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
