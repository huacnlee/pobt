// An opportunity's words: its title and the lines of its reasons and steps, from the keys the market computation
// (core/market.ts, run on this device) gives them in.
import type { Opportunity, Phrase } from "./types";
import { itemName, t } from "./i18n";
import { price } from "../ui/format";

const ITEM_VALUES = new Set(["item", "from", "to"]);
const PRICE_VALUES = new Set(["price", "average"]);

/** A reason or step in the app's language: the items in it named as the language names them, the prices in chaos
 * or divines as the app shows prices (given the divine's price). */
export function phrase(p: Phrase, divine?: number): string {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "key") continue;
    values[k] = ITEM_VALUES.has(k) ? itemName(v) : PRICE_VALUES.has(k) && Number.isFinite(Number(v)) ? price(Number(v), divine) : v;
  }
  return t(`phrase.${p.key}`, values);
}

/** An opportunity's title: the dip's item, or the cycle's path. */
export function opportunityTitle(o: Opportunity): string {
  if (o.type === "dip") return t("opp.dipTitle", { item: itemName(o.itemName) });
  // The computed title carries the cycle's path, in English: "Cycle: Chaos Orb → … → Chaos Orb".
  return t("opp.cycleTitle", { path: cyclePath(o.title.replace(/^Cycle: /, "").split(" → ")) });
}

/** A cycle's path, its items in the app's language. */
export function cyclePath(path: string[]): string {
  return path.map(itemName).join(" → ");
}
