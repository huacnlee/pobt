import { Progress } from "nsh/base";
import { GROW } from "./motion";

/** How far along something is, 0 to 1; with no value, an indeterminate pulse. nsh-base's Progress owns the role, the
 * range and the indicator's width; this is its look. */
export function ProgressBar(props: { value: number | null; class?: string; accessibilityLabel?: string }) {
  return (
    <Progress
      value={props.value === null ? undefined : Math.round(Math.max(0, Math.min(1, props.value)) * 100)}
      indeterminate={props.value === null}
      accessibilityLabel={props.accessibilityLabel}
      class={props.class}
      trackClass="h-1.5 overflow-hidden rounded-full bg-muted"
      indicatorClass={`h-full rounded-full bg-primary ${GROW} ${props.value === null ? "w-full animate-pulse" : ""}`}
    />
  );
}
