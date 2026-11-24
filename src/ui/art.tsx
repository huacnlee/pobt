// The launcher's look, for every POBT screen: the gate's cold light behind, aged gold trim, a jewelled rule.
import { Shader, View, type JSX } from "nsh";
import { GATE } from "../gate";

/** The launcher's gate, dimmed so a screen's content reads over it; fills its parent, behind what follows. */
export function Backdrop(props: { dim?: number }) {
  return (
    <View class="absolute inset-0">
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View class="absolute inset-0 bg-background" style={{ opacity: props.dim ?? 0.78 }} />
    </View>
  );
}

/** A tarnished gold rule with a jewel at its middle. */
export function Rule(props: { class?: string }) {
  return (
    <View class={`h-4 flex-row items-center ${props.class ?? ""}`}>
      <View class="h-0.5 flex-1 bg-linear-to-r from-transparent to-trim-hi" />
      <View class="mx-1 size-2.5 rotate-45 border-2 border-trim-hi bg-jewel" />
      <View class="h-0.5 flex-1 bg-linear-to-l from-transparent to-trim-hi" />
    </View>
  );
}

/** A panel framed by a double gold trim line, as the launcher's game cards. */
export function Framed(props: { class?: string; children?: JSX.Element }) {
  return (
    <View class={`border border-trim bg-card/90 p-0.5 ${props.class ?? ""}`}>
      <View class="flex-1 border border-trim/50">{props.children}</View>
    </View>
  );
}
