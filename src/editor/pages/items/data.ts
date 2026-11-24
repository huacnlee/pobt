// What the Items page reads from Path of Building's Items tab (ext/pobt-native/src/service/items.lua), and the changes
// it makes there: through POB's own slot drop-downs, flask check boxes and item set drop-down, so POB's handlers run.
import type { TipLine } from "../../PobTip";
import { act, build, type Control, change, pob, reload } from "../../session";

export type Rarity = "normal" | "magic" | "rare" | "unique";

/** An item of the build's list, as POB names it. */
export type ItemInfo = { id: number; name: string; title?: string; base?: string; rarity: string; type?: string; equipSlot?: string };

/** A slot POB shows for the active set (ItemSlotControl): its drop-down's names and the ids behind them, "None" first. */
export type SlotInfo = {
  name: string;
  label: string;
  itemId: number;
  flask: boolean;
  active: boolean;
  jewel: boolean;
  parent?: string;
  choices?: string[];
  ids?: number[];
  sel?: number;
  enabled: boolean;
};

export type ItemsData = { sets: Control; weaponSet: 1 | 2; slots: SlotInfo[]; items: ItemInfo[] };

/** A line of POB's tooltip: its text (colour codes kept) and POB's font size, or a rule. */
export type { TipLine } from "../../PobTip";

export type Parsed = { error?: string; item?: ItemInfo; fits?: { name: string; label: string }[]; lines?: TipLine[] };

export const rarityOf = (r: string | undefined): Rarity => {
  const v = (r ?? "").toLowerCase();
  return v === "magic" || v === "rare" || v === "unique" ? v : v === "relic" ? "unique" : "normal";
};

export const readItems = () => pob<ItemsData>("items.read");

/** POB's tooltip of an item; with `slot`, compared against that slot. */
export const tooltipOf = (id: number, slot?: string) => pob<{ lines: TipLine[] }>("items.tooltip", { id, slot });

/** Equips item `id` (0 for none) in `slot` by choosing it in POB's drop-down of that slot. */
export function equip(slot: SlotInfo, id: number) {
  const index = (slot.ids ?? []).indexOf(id);
  if (index < 0) return Promise.resolve();
  return act(["itemsTab", "slots", slot.name], index + 1);
}

/** Ticks a flask slot's check box. */
export const setFlask = (slot: string, on: boolean) => act(["itemsTab", "slots", slot, "controls", "activate"], on);

/** Picks the item set at `index` (1-based) of POB's drop-down. */
export const setActiveSet = (index: number) => change("items.setActiveSet", { index });

/** Uses weapon set 1 or 2 (POB's "Weapon Set: I / II" buttons). */
export const setWeaponSet = (set: 1 | 2) => change("items.setWeaponSet", { set });

/** Equips an item where POB's double-click in its item list puts it (ItemsTab:EquipItemInSet). */
export const equipItem = (id: number) => change("items.equipItem", { id });

export const parsePasted = (text: string) => pob<Parsed>("items.parse", { text });
export const cancelPasted = () => pob("items.cancel").catch(() => {});

/** Adds the item `parsePasted` read, equipped in `slot` or, without one, where POB puts it; its id. */
export async function addPasted(slot?: string): Promise<number> {
  build.busy.set(true);
  try {
    const { id } = await pob<{ id: number }>("items.add", { slot });
    await pob("settle");
    await reload();
    return id;
  } finally {
    build.busy.set(false);
  }
}

/** A control of a window POB has open (the craft and custom-item windows), in POB's layout order. */
export type PopupControl = {
  name: string;
  kind: "list" | "edit" | "check" | "button";
  shown: boolean;
  enabled?: boolean;
  caption?: string;
  tip: boolean;
  label?: string;
  items?: string[];
  sel?: number;
  text?: string;
  placeholder?: string;
  checked?: boolean;
};
export type Popup = { title: string; controls: PopupControl[] };

/** The item being made or edited (POB's display item), its tooltip, and the window POB has open for it. */
export type Display = { popup: Popup | null; item?: ItemInfo; inBuild?: boolean; lines?: TipLine[] };

export const readDisplay = () => pob<Display>("items.display");
/** Opens POB's "Craft item..." ("craft"), "Create custom..." ("custom") or "Edit..." ("edit") window. */
export const openWindow = (what: "craft" | "custom" | "edit") => pob<Popup | null>("items.open", { what });
export const popupSet = (name: string, value: number | string | boolean) => pob<Popup | null>("items.popupSet", { name, value });
export const popupPress = (name: string) => pob<{ popup: Popup | null }>("items.popupPress", { name });
export const popupTip = (name: string, index?: number) => pob<{ lines: TipLine[] }>("items.popupTip", { name, index });
export const popupClose = () => pob("items.popupClose").catch(() => {});

/** Puts POB's display item in the build ("Save" / "Add to build"); its id. */
export async function saveDisplay(): Promise<number> {
  build.busy.set(true);
  try {
    const { id } = await pob<{ id: number }>("items.saveDisplay");
    await pob("settle");
    await reload();
    return id;
  } finally {
    build.busy.set(false);
  }
}
