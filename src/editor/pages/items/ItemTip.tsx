// An item as Path of Building's tooltip draws it (ItemsTab:AddItemTooltip): POB's own lines in the shared compact
// form (PobTip's TipLines: the name a small bold heading, every other line the smallest text, tight), centred as POB
// centres an item's, in a box edged in the item's rarity.
import { View } from "nsh";
import { TipLines } from "../../PobTip";
import type { Rarity, TipLine } from "./data";

/** The text class of each rarity's colour. */
export const RARITY_TEXT: Record<Rarity, string> = {
  normal: "text-rarity-normal",
  magic: "text-rarity-magic",
  rare: "text-rarity-rare",
  unique: "text-rarity-unique",
};

const RARITY_BORDER: Record<Rarity, string> = {
  normal: "border-rarity-normal/60",
  magic: "border-rarity-magic/60",
  rare: "border-rarity-rare/60",
  unique: "border-rarity-unique/60",
};

/** `flat`: no box of its own, inside a card that draws one (a hover card). */
export function ItemTip(props: { lines: TipLine[]; rarity: Rarity; flat?: boolean; class?: string }) {
  return (
    <View
      class={`${props.flat ? "" : `rounded-(--radius) border bg-background px-3 py-2 ${RARITY_BORDER[props.rarity]}`} ${props.class ?? ""}`}
    >
      <TipLines lines={props.lines} center />
    </View>
  );
}
