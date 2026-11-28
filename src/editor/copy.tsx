// Copying an item's or a gem's name as the game writes it, to find it on the game's market (the trade site, a stash's
// or a vendor's search): a unique by its name, any other item by its base (a rare's own name is made up), a gem by its
// name; in Simplified Chinese, Path of Exile's names are Tencent's (Pob.gameNames).
import { Clipboard } from "nsh";
import { Pob } from "pobt/native";
import { IconButton, toast } from "../ui";
import { language, t } from "./i18n";
import { service } from "./session";

/** What the market finds an item by, in English: a unique's name, else its base. */
export function marketName(item: { name: string; title?: string; base?: string; rarity: string }): string {
  const unique = /^(unique|relic)$/i.test(item.rarity);
  return (unique ? item.title : item.base) || item.name;
}

/** Copies `english` (an item's or a gem's name) as the game in use names it, and says what was copied. */
export async function copyName(english: string) {
  const [name] = JSON.parse(Pob.gameNames(service.game() ?? "poe1", language() ?? "", JSON.stringify([english]))) as string[];
  await Clipboard.writeText(name);
  toast(`${t("copiedName")}${name}`);
}

/** The small button that copies `english`'s name for the market. */
export function CopyName(props: { english: string }) {
  return <IconButton icon="copy" size="sm" label={t("copyName")} onPress={() => void copyName(props.english)} />;
}
