// poe.ninja's Path of Exile 1 prices, made `Price`s.
//
// Two kinds of page: the exchange's (`/poe1/api/economy/exchange/current/overview`: currency, cards, fragments…,
// priced from Faustus's exchange with the chaos traded a day) and the trade site's listings
// (`/poe1/api/economy/stash/current/item/overview`: uniques and crafting bases, with how many are listed).
// The API runs poe.ninja's own site and is not a product: it can change, it asks for a User-Agent that says who calls,
// and it blocks heavy use. Its pages are cached about 5 minutes; this asks for each at most once an hour.

import type { Kind, Price, Snapshot } from "./types";

const API = "https://poe.ninja/poe1/api";
export const USER_AGENT = "pobt-market/0.1 (+https://github.com/huacnlee/pobt)";

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
  lines: { id: string; primaryValue: number; volumePrimaryValue?: number; sparkline?: { totalChange?: number } }[];
  items: { id: string; name: string }[];
}

interface StashPage {
  lines: {
    name: string;
    baseType?: string;
    variant?: string;
    links?: number;
    itemType?: string;
    levelRequired?: number;
    chaosValue: number;
    listingCount?: number;
    count?: number;
    sparkLine?: { totalChange?: number };
  }[];
}

const INFLUENCES = new Set(["Shaper", "Elder", "Crusader", "Redeemer", "Hunter", "Warlord"]);

/** The prices on one page as it came from poe.ninja. */
export function parsePage(source: Pick<Source, "market" | "kind">, page: unknown): Price[] {
  if (source.market === "exchange") {
    const { lines, items } = page as ExchangePage;
    const names = new Map(items.map((item) => [item.id, item.name]));
    return lines.flatMap((line): Price[] => {
      const name = names.get(line.id);
      if (!name || !(line.primaryValue > 0)) return [];
      // The volume is in chaos traded a day: in items, it is that over the price.
      const volume = (line.volumePrimaryValue ?? 0) / line.primaryValue;
      return [
        {
          name,
          baseType: name,
          kind: source.kind,
          chaos: line.primaryValue,
          listings: Math.round(volume),
          volume,
          change7d: line.sparkline?.totalChange,
        },
      ];
    });
  }
  return (page as StashPage).lines.flatMap((line): Price[] => {
    if (!(line.chaosValue > 0)) return [];
    const common = {
      chaos: line.chaosValue,
      listings: line.listingCount ?? line.count ?? 0,
      change7d: line.sparkLine?.totalChange,
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
