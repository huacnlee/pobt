// Line icons (Lucide's shapes), white SVGs recoloured by a `tint-*` token class, so they follow the theme.
import { Image } from "nsh";
import check from "./icons/check.svg";
import chevronDown from "./icons/chevron-down.svg";
import chevronRight from "./icons/chevron-right.svg";
import chevronUp from "./icons/chevron-up.svg";
import x from "./icons/x.svg";

const ICONS = { check, "chevron-down": chevronDown, "chevron-right": chevronRight, "chevron-up": chevronUp, x };
export type IconName = keyof typeof ICONS;

/** An icon, `size` points square (default 16); `class` gives its colour as `tint-*` (default the muted foreground); `color` (the launcher's own palette) over it. */
export function Icon(props: { name: IconName; size?: number; class?: string; color?: string }) {
  return (
    <Image
      src={ICONS[props.name]}
      accessible={false}
      class={props.class ?? "tint-muted-foreground"}
      style={{ width: props.size ?? 16, height: props.size ?? 16, tintColor: props.color }}
    />
  );
}
