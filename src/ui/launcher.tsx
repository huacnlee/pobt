// The launcher's own art (the first screen of POBT), shared with the screens that wear it (the Builds list): Path of
// Exile 2's palette and faces, plaques cut from the atlas, the jewelled rule, its buttons and the gate behind.
import { createAnimatedValue, Easing, Image, Shader, signal, Text, View, type ViewStyle } from "nsh";
import { Checkbox } from "nsh/base";
import { Icon } from "./icon";
import Cinzel from "../../assets/fonts/Cinzel-Bold.woff2";
import "../../assets/fonts/Cinzel-SemiBold.woff2";
import plaques from "../../assets/ui/plaques.png";
import title from "../../assets/ui/title.png";
import { GATE, GATE_MOTION } from "../gate";

// Path of Exile 2's look: aged gold trim, plaques with pointed ends, cold light through a gothic door.
export const C = {
  bg: "#07080a",
  panel: "rgba(5,6,9,0.9)",
  trim: "#6b522c",
  trimHi: "#b18d4e",
  gold: "#d8bd85",
  goldHi: "#dcc792",
  text: "#cfc8bb",
  muted: "#948b7b",
  dim: "#655d50",
  ink: "#140d05",
  unique: "#e6894a",
  red: "#e0604a",
};
export const DISPLAY = `${Cinzel}, Microsoft YaHei, Malgun Gothic, serif`;
export const BODY = "Microsoft YaHei, Malgun Gothic, Segoe UI, sans-serif";

// Buttons light up under the pointer; pressed, their plaque is drawn sunk in (the atlas' pressed rows).
// Letters cut into brass: dark, with light catching their lower edge.
export const ENGRAVED = "0 1px 0 rgba(255,236,190,0.45)";
export const HOVER: ViewStyle = { filter: "brightness(1.18)" };
/** A button that sinks when pressed, and stays down a moment after a quick click so the press is seen: `children`
 * is given whether it is down. */
export function PressButton(props: { onPress: () => void; style: ViewStyle; children: (down: () => boolean) => any }) {
  const down = signal(false);
  let release: ReturnType<typeof setTimeout> | undefined;
  return (
    <View
      role="button"
      onPress={props.onPress}
      onPressDown={() => {
        clearTimeout(release);
        down.set(true);
      }}
      onPressUp={() => {
        release = setTimeout(() => down.set(false), 120);
      }}
      style={props.style}
      hoverStyle={down() ? undefined : HOVER}
    >
      {props.children(down)}
    </View>
  );
}

// The plaques' atlas (scripts/ui-art.mjs): a row per kind, each a left cap, a middle that stretches and a right cap.
export const ATLAS = { width: 640, rowHeight: 96, cap: 64, middle: 512 };
export const ROWS = { red: 0, dark: 1, brass: 2 };
export const KINDS = 3; // then the same, pressed
export type PlaqueKind = keyof typeof ROWS;

/** A part of a plaque's row: the atlas, scaled to `sx` across and `sy` down, moved so `x` sits at the left. */
export function AtlasPart(props: { row: () => number; x: number; sx: () => number; sy: number; style: ViewStyle }) {
  return (
    <View style={{ overflow: "hidden", ...props.style }}>
      <Image
        src={plaques}
        style={{
          position: "absolute",
          left: -props.x * props.sx(),
          top: -props.row() * ATLAS.rowHeight * props.sy,
          width: ATLAS.width * props.sx(),
          height: ATLAS.rowHeight * KINDS * 2 * props.sy,
          objectFit: "fill",
        }}
      />
    </View>
  );
}

/** A tarnished gold rule with a jewelled diamond at its middle. */
export function GoldRule(props: { width: number; dim?: boolean }) {
  const line = (dir: string) => ({ flex: 1, height: 2, backgroundImage: `linear-gradient(${dir}, rgba(143,118,70,0), #b9a370)`, boxShadow: "0 1px 0 rgba(0,0,0,0.6)" });
  return (
    <View style={{ width: props.width, height: 18, flexDirection: "row", alignItems: "center", alignSelf: "center", opacity: props.dim ? 0.5 : 1 }}>
      <View style={line("90deg")} />
      <View style={{ width: 12, height: 12, marginHorizontal: 4, transform: [{ rotate: "45deg" }], borderWidth: 2, borderColor: "#a68d5a", backgroundColor: "#640d0e", boxShadow: "0 0 0 1px #000" }} />
      <View style={line("270deg")} />
    </View>
  );
}

/** A plaque with pointed ends, `height` tall, its content centred over it. */
export function Plaque(props: { kind: () => PlaqueKind; height: number; pressed?: () => boolean; children: any }) {
  const s = props.height / ATLAS.rowHeight;
  const cap = ATLAS.cap * s;
  const down = () => props.pressed?.() ?? false;
  const row = () => ROWS[props.kind()] + (down() ? KINDS : 0);
  // The middle stretches across: its scale follows its width.
  const middleWidth = signal(ATLAS.middle * s);
  return (
    <View style={{ height: props.height, flexDirection: "row" }}>
      <AtlasPart row={row} x={0} sx={() => s} sy={s} style={{ width: cap, height: props.height }} />
      <View style={{ flex: 1, height: props.height }} onLayout={(e) => middleWidth.set(e.bounds.size.width)}>
        <AtlasPart
          row={row}
          x={ATLAS.cap}
          sx={() => middleWidth() / ATLAS.middle}
          sy={s}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
      <AtlasPart row={row} x={ATLAS.cap + ATLAS.middle} sx={() => s} sy={s} style={{ width: cap, height: props.height }} />
      <View
        style={{
          position: "absolute",
          top: down() ? 2 : 0,
          bottom: down() ? -2 : 0,
          left: cap * 0.75,
          right: cap * 0.75,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

/** The start button: the red banner with gold trim. */
export function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <PressButton onPress={props.onPress} style={{ width: 360 }}>
      {(down) => (
        <Plaque kind={() => "red"} height={64} pressed={down}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: "700", letterSpacing: 6, color: "#f6e6c2" }}>{props.label}</Text>
        </Plaque>
      )}
    </PressButton>
  );
}

/** A small brass button, as the site's store buttons. */
export function BrassButton(props: { label: string; onPress: () => void }) {
  return (
    <PressButton onPress={props.onPress} style={{ minWidth: 150 }}>
      {(down) => (
        <Plaque kind={() => "brass"} height={38} pressed={down}>
        <Text style={{ fontFamily: BODY, fontSize: 13, fontWeight: "700", color: C.ink, textShadow: ENGRAVED }}>{props.label}</Text>
        </Plaque>
      )}
    </PressButton>
  );
}

// The backdrop's motion runs on its own clock at 24 frames a second: the drift is slow, and the screen's full rate
// would redraw the whole window for nothing. (A day of seconds; then it stops.)
export const motionTime = createAnimatedValue(0);
motionTime.timing(86400, { duration: 86400 * 1000, easing: Easing.linear, frameRate: 24 });


/** The gate, lit and drifting, filling its parent behind what follows. */
export function Gate() {
  return (
    <>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <Shader source={GATE_MOTION} uniforms={{ time: motionTime }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
    </>
  );
}

/** "Path of Building" in the game's lettering, `width` wide. */
export function Title(props: { width: number }) {
  return <Image src={title} style={{ width: props.width, height: props.width * 0.1375 }} accessibilityLabel="Path of Building" />;
}

/** A line of text over the gate, kept readable by a soft shadow behind it. */
export function Subtitle(props: { children: string }) {
  return (
    <View style={{ paddingHorizontal: 64, paddingVertical: 10, backgroundImage: "radial-gradient(ellipse closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.12) 75%, rgba(0,0,0,0))" }}>
      <Text style={{ fontFamily: BODY, fontSize: 14, color: C.text, textShadow: "0 0 3px #000, 0 0 8px #000, 0 0 14px #000, 0 1px 2px #000" }}>{props.children}</Text>
    </View>
  );
}

/** A checkbox in the launcher's look: a small trimmed square, a gold check while checked, its label in the gold body face. */
export function GoldCheckbox(props: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <Checkbox
      checked={props.checked}
      onChange={({ checked }) => props.onChange(checked)}
      accessibilityLabel={props.label}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
      indicatorStyle={{
        width: 18,
        height: 18,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: props.checked ? C.trimHi : C.trim,
        backgroundColor: C.panel,
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.7)",
      }}
      indicator={props.checked ? <Icon name="check" size={13} color={C.goldHi} /> : undefined}
    >
      <Text style={{ fontFamily: BODY, fontSize: 14, color: props.checked ? C.goldHi : C.text, textShadow: "0 0 3px #000, 0 1px 2px #000" }}>{props.label}</Text>
    </Checkbox>
  );
}
