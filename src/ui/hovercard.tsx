// A card shown beside the pointer while it rests on something (an item, a gem, a passive, an option): Path of
// Building's tooltips. It opens where the pointer is, not at an edge of a wide row, and its content is asked for as the
// pointer arrives, so the card shows once, at its final size, after a short rest.
import { type JSX, signal, View } from "nsh";
import { Tooltip } from "nsh/base";

/** The card's entrance and exit: a fade only (a large card scaling redraws all of it each frame). */
const SHOW = "transition-opacity duration-120 ease-out motion-reduce:transition-none";

/** Wraps `children`; while the pointer rests on them for `delay` ms, `content` shows beside the pointer (right and
 * below; the other side where there is no room). `onPrepare` runs as the pointer arrives (start loading then);
 * `ready` says the content has come, and the card waits for it up to `wait` ms so it does not grow once shown. */
export function HoverCard(props: {
  content: () => JSX.Element;
  onPrepare?: () => void;
  ready?: () => boolean;
  delay?: number;
  wait?: number;
  disabled?: boolean;
  class?: string;
  /** The card's own classes (its width). */
  cardClass?: string;
  children?: JSX.Element;
}) {
  const at = signal({ x: 0, y: 0 });
  const open = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let since = 0;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const show = () => {
    const waited = Date.now() - since;
    if (props.ready && !props.ready() && waited < (props.wait ?? 600)) {
      timer = setTimeout(show, 30);
      return;
    }
    timer = undefined;
    open.set(true);
  };
  return (
    <View
      class={`relative ${props.class ?? ""}`}
      onMouseEnter={(e) => {
        if (props.disabled) return;
        at.set({ x: e.position.x, y: e.position.y });
        since = Date.now();
        props.onPrepare?.();
        clear();
        timer = setTimeout(show, props.delay ?? 150);
      }}
      onMouseMove={(e) => {
        // Until it shows, it goes where the pointer rests; once shown it stays put, as a tooltip does.
        if (!open()) at.set({ x: e.position.x, y: e.position.y });
      }}
      onMouseLeave={() => {
        clear();
        open.set(false);
      }}
    >
      {props.children}
      <View
        style={{ position: "absolute", left: at().x, top: at().y, width: 1, height: 1 }}
        tooltip={
          <Tooltip
            open={open()}
            delay={Number.POSITIVE_INFINITY}
            placement="right"
            align="start"
            offset={14}
            margin={8}
            class={`rounded-(--radius) border border-border bg-popover px-3 py-2 shadow-lg ${SHOW} ${props.cardClass ?? "max-w-96"}`}
            startingClass="opacity-0"
            endingClass="opacity-0"
          >
            <If when={open()}>{props.content()}</If>
          </Tooltip>
        }
      />
    </View>
  );
}
