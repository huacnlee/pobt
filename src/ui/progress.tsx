import { View } from "nsh";
import { GROW } from "./motion";

/** How far along something is, 0 to 1; with no value, an indeterminate pulse. */
export function ProgressBar(props: { value: number | null; class?: string }) {
  return (
    <View class={`h-1.5 overflow-hidden rounded-full bg-muted ${props.class ?? ""}`} role="progressbar">
      <View
        class={`h-full rounded-full bg-primary ${GROW}`}
        classList={{ "animate-pulse": props.value === null }}
        style={{ width: props.value === null ? "100%" : `${Math.round(Math.max(0, Math.min(1, props.value)) * 100)}%` }}
      />
    </View>
  );
}
