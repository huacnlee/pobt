// The market as the pages read it: the overview, the opportunities, every row of a kind, one item. All of it is
// computed on this device (engine.ts); these wait for the first market when there is none yet.
import { itemDetail, opportunities, rows, summary, updateNow } from "./engine";
import { itemName, searchText, t } from "./i18n";
import type { ItemDetail, Kind, OpportunitiesFile, Row, RowsFile, Summary } from "./types";

export const fetchSummary = (): Promise<Summary> => summary();

export const fetchOpportunities = (): Promise<OpportunitiesFile> => opportunities();

export const fetchRows = (kind: Kind): Promise<RowsFile> => rows(kind);

export const fetchItem = (id: string, compare?: string): Promise<ItemDetail> => itemDetail(id, compare);

/** A page's Retry after it failed to load: an update when one may run (the last failed), then reading again. */
export function retry(resource: { refetch(): void }) {
  updateNow().finally(() => resource.refetch());
}

/** The pictures of items by id, from the market's rows of each one's kind (fetched once for every kind asked). */
export async function itemIcons(ids: string[]): Promise<Map<string, string>> {
  const wanted = new Set(ids.filter(Boolean));
  const kinds = [...new Set([...wanted].map(kindOfId))];
  const files = await Promise.all(kinds.map((k) => fetchRows(k).catch(() => null)));
  const icons = new Map<string, string>();
  for (const f of files) for (const r of f?.rows ?? []) if (wanted.has(r.id) && r.icon) icons.set(r.id, r.icon);
  return icons;
}

/** The row of an item named as the player typed it: its English name or its name in the app's language. */
export async function findRow(name: string): Promise<Row | undefined> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  for (const kind of KINDS) {
    const file = await fetchRows(kind).catch(() => null);
    const hit = file?.rows.find((r) => r.name.toLowerCase() === wanted || itemName(r.name).toLowerCase() === wanted);
    if (hit) return hit;
  }
  return undefined;
}

/** A kind of item, in words. */
export const kindLabel = (k: Kind) => t(`kind.${k}`);

export const KINDS: Kind[] = ["currency", "card", "unique", "base"];

/** Rows matching a search: every word must be in the name or its base type. */
export function search(rows: Row[], query: string, limit = 200): Row[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows.slice(0, limit);
  const out: Row[] = [];
  for (const r of rows) {
    const text = `${searchText(r.name)} ${searchText(r.baseType)} ${r.category}`.toLowerCase();
    if (words.every((w) => text.includes(w))) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** The kind an id belongs to, from the poe.ninja page in front of its colon. */
export function kindOfId(id: string): Kind {
  const page = id.split(":")[0].toLowerCase();
  if (page === "currency" || page === "fragment") return "currency";
  if (page.includes("card")) return "card";
  if (page.startsWith("unique")) return "unique";
  if (page.includes("base")) return "base";
  return "currency";
}
