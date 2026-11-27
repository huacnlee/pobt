// poe.ninja's Path of Exile 1 prices, made `Price`s.
//
// Two kinds of page: the exchange's (`/poe1/api/economy/exchange/current/overview`: currency, cards, fragments…,
// priced from Faustus's exchange with the chaos traded a day) and the trade site's listings
// (`/poe1/api/economy/stash/current/item/overview`: uniques and crafting bases, with how many are listed).
// The API runs poe.ninja's own site and is not a product: it can change, it asks for a User-Agent that says who calls,
// and it blocks heavy use. Its pages are cached about 5 minutes; this asks for each at most once an hour.

import type { CrossDay, Kind, Price, Snapshot, TradeDay, Trades } from "./types";

const API = "https://poe.ninja/poe1/api";
/** Who asks: the app's name (data/ninja.ts adds its version). */
export const USER_AGENT = "POBT";

export interface Source {
  page: string;
  market: "exchange" | "stash";
  kind: Kind;
  url: string;
}

const EXCHANGE: [string, Kind][] = [
  ["Currency", "currency"],
  ["Fragment", "currency"],
  ["DivinationCard", "card"],
  ["Scarab", "currency"],
  ["Oil", "currency"],
  ["Essence", "currency"],
  ["Fossil", "currency"],
  ["Resonator", "currency"],
  ["DeliriumOrb", "currency"],
  ["Omen", "currency"],
  ["Tattoo", "currency"],
  ["Artifact", "currency"],
  ["Runegraft", "currency"],
  ["AllflameEmber", "currency"],
];
const STASH: [string, Kind][] = [
  ["UniqueWeapon", "unique"],
  ["UniqueArmour", "unique"],
  ["UniqueAccessory", "unique"],
  ["UniqueJewel", "unique"],
  ["UniqueFlask", "unique"],
  ["BaseType", "base"],
];

/** Every page a league's prices come from: 20, under the 50 requests a free Worker may make in one run. */
export function sources(league: string): Source[] {
  const q = (type: string) => `league=${encodeURIComponent(league)}&type=${type}`;
  return [
    ...EXCHANGE.map(([page, kind]) => ({
      page,
      kind,
      market: "exchange" as const,
      url: `${API}/economy/exchange/current/overview?${q(page)}`,
    })),
    ...STASH.map(([page, kind]) => ({
      page,
      kind,
      market: "stash" as const,
      url: `${API}/economy/stash/current/item/overview?${q(page)}`,
    })),
  ];
}

interface ExchangePage {
  core?: { rates?: { divine?: number } };
  lines: {
    id: string;
    primaryValue: number;
    volumePrimaryValue?: number;
    maxVolumeCurrency?: string;
    maxVolumeRate?: number;
    sparkline?: { totalChange?: number; data?: (number | null)[] };
  }[];
  items: { id: string; name: string; image?: string; detailsId?: string }[];
}

interface StashPage {
  lines: {
    id?: number;
    name: string;
    baseType?: string;
    variant?: string;
    links?: number;
    itemType?: string;
    icon?: string;
    levelRequired?: number;
    chaosValue: number;
    listingCount?: number;
    count?: number;
    sparkLine?: { totalChange?: number; data?: (number | null)[] };
  }[];
}

/** Every divination card has the same picture in the inventory; the exchange page gives cards none. */
export const CARD_ICON = "image/Art/2DItems/Divination/InventoryIcon.png";

const INFLUENCES = new Set(["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"]);

/** A picture's path on the game's CDN, from the full URL (stash pages) or the path (exchange pages). */
export function iconPath(url?: string): string | undefined {
  if (!url) return undefined;
  const path = url.replace(/^https?:\/\/web\.poecdn\.com\//, "").replace(/^\//, "");
  return path.startsWith("gen/image/") || path.startsWith("image/Art/") ? path : undefined;
}

/** A sparkline's points, or none when it has gaps or too few to draw. */
function sparkOf(data?: (number | null)[]): number[] | undefined {
  if (!data || data.length < 2 || data.some((d) => typeof d !== "number")) return undefined;
  return data as number[];
}

/** The prices on one page as it came from poe.ninja. */
export function parsePage(source: Pick<Source, "market" | "kind"> & { page?: string }, page: unknown): Price[] {
  const category = source.page;
  if (source.market === "exchange") {
    const { lines, items } = page as ExchangePage;
    const names = new Map(items.map((item) => [item.id, item]));
    return lines.flatMap((line): Price[] => {
      const name = names.get(line.id)?.name;
      if (!name || !(line.primaryValue > 0)) return [];
      // The volume is in chaos traded a day: in items, it is that over the price.
      const volume = (line.volumePrimaryValue ?? 0) / line.primaryValue;
      const pair =
        line.maxVolumeCurrency && line.maxVolumeCurrency !== line.id && line.maxVolumeRate! > 0
          ? { currency: line.maxVolumeCurrency, rate: line.maxVolumeRate! }
          : undefined;
      return [
        {
          id: category ? `${category}:${line.id}` : undefined,
          category,
          name,
          baseType: name,
          kind: source.kind,
          chaos: line.primaryValue,
          listings: Math.round(volume),
          volume,
          change7d: line.sparkline?.totalChange,
          spark: sparkOf(line.sparkline?.data),
          pair,
          details: names.get(line.id)?.detailsId,
          icon: iconPath(names.get(line.id)?.image) ?? (source.kind === "card" ? CARD_ICON : undefined),
        },
      ];
    });
  }
  return (page as StashPage).lines.flatMap((line): Price[] => {
    if (!(line.chaosValue > 0)) return [];
    const common = {
      id: category && line.id !== undefined ? `${category}:${line.id}` : undefined,
      category,
      spark: sparkOf(line.sparkLine?.data),
      chaos: line.chaosValue,
      listings: line.listingCount ?? line.count ?? 0,
      change7d: line.sparkLine?.totalChange,
      icon: iconPath(line.icon),
    };
    if (source.kind === "base") {
      // Two influences come only from crafting, never from the ground.
      if (line.variant && !INFLUENCES.has(line.variant)) return [];
      return [
        {
          ...common,
          name: line.name,
          baseType: line.name,
          kind: "base" as const,
          itemClass: line.itemType,
          itemLevel: line.levelRequired,
          influence: line.variant,
        },
      ];
    }
    // A unique's linked versions are priced for the links, not as it drops.
    if (!line.baseType || (line.links ?? 0) >= 5) return [];
    return [{ ...common, name: line.name, baseType: line.baseType, kind: "unique" as const, itemClass: line.itemType }];
  });
}

/** A snapshot from every page's prices; the divine's price is the exchange's. */
export function toSnapshot(league: string, at: string, prices: Price[]): Snapshot {
  const divine = prices.find((p) => p.kind === "currency" && p.name === "Divine Orb")?.chaos;
  if (!divine) throw new Error(`${league}: no price for the Divine Orb`);
  return { league, at, divine, prices };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** The challenge league: the first that is neither Standard nor Hardcore, nor a hardcore one. */
export async function currentLeague(): Promise<string> {
  const state = (await getJson(`${API}/data/index-state`)) as { economyLeagues: { name: string }[] };
  const league = state.economyLeagues.find((l) => !/^(Standard|Hardcore)$|Hardcore|^HC /i.test(l.name));
  return league?.name ?? "Standard";
}

/** All of a league's prices now: 20 requests, one after another to go easy on poe.ninja. */
export async function fetchSnapshot(league: string): Promise<Snapshot> {
  const prices: Price[] = [];
  for (const source of sources(league)) prices.push(...parsePage(source, await getJson(source.url)));
  return toSnapshot(league, new Date().toISOString(), prices);
}

interface DetailsPage {
  pairs: { id: string; rate: number; volumePrimaryValue?: number; history?: { timestamp: string; rate: number; volumePrimaryValue?: number }[] }[];
}

/** The details page of one exchange item: `page` is the overview it is on (`Currency`, `DivinationCard`…). */
export function detailsUrl(league: string, page: string, slug: string): string {
  return `${API}/economy/exchange/current/details?league=${encodeURIComponent(league)}&type=${page}&id=${encodeURIComponent(slug)}`;
}

/** The divine's chaos price each day, from its own details page. */
export function divineDays(page: unknown): Map<string, number> {
  const chaos = (page as DetailsPage).pairs.find((p) => p.id === "chaos");
  return new Map((chaos?.history ?? []).filter((h) => h.rate > 0).map((h) => [h.timestamp.slice(0, 10), h.rate]));
}

/**
 * An item's days of trades from its details page. Each pair has a rate a day (of the pair, for one item) and the
 * chaos traded in it; the days are read in the pair that trades most, and priced in chaos with the divine's price
 * that day (`divine`, from `divineDays`). Days nothing traded keep a stale rate: their volume says so.
 */
export function parseDetails(page: unknown, divine: Map<string, number>): Trades | undefined {
  const pairs = (page as DetailsPage).pairs.filter((p) => p.rate > 0 && p.history?.length);
  const traded = (p: DetailsPage["pairs"][number]) => p.history![0]?.volumePrimaryValue ?? p.volumePrimaryValue ?? 0;
  const main = [...pairs].sort((a, b) => traded(b) - traded(a))[0];
  if (!main) return undefined;
  const toChaos = (currency: string, rate: number, day: string) =>
    currency === "chaos" ? rate : currency === "divine" && divine.has(day) ? rate * divine.get(day)! : undefined;
  const days: TradeDay[] = [];
  for (const h of main.history!) {
    const day = h.timestamp.slice(0, 10);
    const chaos = toChaos(main.id, h.rate, day);
    if (!chaos || !(h.rate > 0) || !divine.has(day)) continue;
    const value = pairs.reduce((sum, p) => sum + (p.history!.find((x) => x.timestamp === h.timestamp)?.volumePrimaryValue ?? 0), 0);
    days.push({ day, rate: h.rate, chaos, divines: chaos / divine.get(day)!, volume: value / chaos });
  }
  days.sort((a, b) => a.day.localeCompare(b.day));
  const inChaos = pairs.find((p) => p.id === "chaos");
  const inDivines = pairs.find((p) => p.id === "divine");
  const cross: CrossDay[] = [];
  for (const c of inChaos?.history ?? []) {
    const day = c.timestamp.slice(0, 10);
    const d = inDivines?.history!.find((x) => x.timestamp === c.timestamp);
    const volume = Math.min(c.volumePrimaryValue ?? 0, d?.volumePrimaryValue ?? 0);
    if (!d || !(c.rate > 0) || !(d.rate > 0) || !divine.has(day) || !(volume > 0)) continue;
    const div = divine.get(day)!;
    cross.push({
      day,
      ratio: (d.rate * div) / c.rate,
      volume,
      chaos: c.rate,
      divines: d.rate,
      divine: div,
      chaosVolume: c.volumePrimaryValue ?? 0,
      divineVolume: d.volumePrimaryValue ?? 0,
    });
  }
  cross.sort((a, b) => a.day.localeCompare(b.day));
  return { pair: main.id, days, cross: cross.length ? cross : undefined };
}

/**
 * The days of trades of `wanted` (exchange prices with a details page), by price id: one request each, one after
 * another, and one for the divine. A page that fails is left out: the price then makes no opportunity (none at all
 * when the divine's fails).
 */
export async function fetchTrades(
  league: string,
  wanted: Price[],
  get: (url: string) => Promise<unknown> = getJson,
): Promise<Map<string, Trades>> {
  const out = new Map<string, Trades>();
  if (!wanted.length) return out;
  let divine: Map<string, number>;
  try {
    divine = divineDays(await get(detailsUrl(league, "Currency", "divine-orb")));
  } catch (error) {
    console.error("details", "Divine Orb", (error as Error).message);
    return out;
  }
  for (const price of wanted) {
    if (!price.id || !price.details || !price.category) continue;
    try {
      const trades = parseDetails(await get(detailsUrl(league, price.category, price.details)), divine);
      if (trades) out.set(price.id, trades);
    } catch (error) {
      console.error("details", price.name, (error as Error).message);
    }
  }
  return out;
}
