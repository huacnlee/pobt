// POBT's popover: a panel that opens beside what was pressed and stays until dismissed, growing from its trigger
// (POPUP, 180 ms).
import type { JSX } from "nsh";
import { type Align, type Placement, Popover as BasePopover, Tooltip } from "nsh/base";
import { POPUP, POPUP_END, POPUP_START } from "./motion";

const BOX = "rounded-(--radius) border border-border bg-popover shadow-lg";

/** A panel opened by pressing `trigger`, beside it; Escape and a press outside close it. */
export function Popover(props: {
  trigger: JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  align?: Align;
  class?: string;
  children?: JSX.Element;
}) {
  return (
    <BasePopover
      open={props.open}
      onOpenChange={(e) => props.onOpenChange?.(e.open)}
      placement={props.placement ?? "bottom"}
      align={props.align ?? "start"}
      offset={6}
      margin={8}
      trigger={props.trigger}
      popupClass={`${BOX} ${POPUP} ${props.class ?? ""}`}
      popupStartingClass={POPUP_START}
      popupEndingClass={POPUP_END}
    >
      {props.children}
    </BasePopover>
  );
}

/** A wide hover card, given as a view's `tooltip`, lined up with its view (a canvas's hovered spot: the tree's node).
 * `open`: shown while true, by the app alone, never by the pointer or the focus. Over rows, use `HoverCard`, which
 * opens beside the pointer. */
export function Peek(props: {
  placement?: Placement;
  align?: Align;
  delay?: number;
  open?: boolean;
  onOpen?: () => void;
  class?: string;
  children?: JSX.Element;
}) {
  return (
    <Tooltip
      open={props.open}
      placement={props.placement ?? "right"}
      align={props.align}
      margin={8}
      delay={props.open === undefined ? (props.delay ?? 300) : Number.POSITIVE_INFINITY}
      class={`${BOX} transition-opacity duration-120 ease-out motion-reduce:transition-none ${props.class ?? ""}`}
      startingClass="opacity-0"
      endingClass="opacity-0"
      onOpenChange={(e) => e.open && props.onOpen?.()}
    >
      {props.children}
    </Tooltip>
  );
}
