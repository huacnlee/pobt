/** What a price is for: decides how it sells (exchange or trade) and how the filter matches it. */
export type Kind =
  | "currency" // orbs, shards, lifeforce, oils, fossils, essences, scarabs…: stackable, sold on Faustus's exchange
  | "card" // divination cards: stackable, sold on the exchange
  | "unique" // the filter only sees the base type
  | "base"; // a crafting base: base type, item level, influence

/** One price, from any source, as the value model reads it. */
export interface Price {
  /** Stable across days: the poe.ninja page and its id there (`Currency:divine`, `UniqueAccessory:135098`). Absent on
   * prices made by hand (tests, fixtures); `priceId` then makes one from the name. */
  id?: string;
  /** The poe.ninja page it came from: `Currency`, `Scarab`, `UniqueArmour`, `BaseType`… */
  category?: string;
  /** The name a player knows it by (a unique's name, or the base type). */
  name: string;
  /** What `BaseType ==` matches in a filter. */
  baseType: string;
  kind: Kind;
  /** Price of one, in chaos orbs. */
  chaos: number;
  /** Listings the price was taken from: how many sellers compete. */
  listings: number;
  /** Traded per day, when the source says (the exchange does). */
  volume?: number;
  /** Change over the last 7 days, in percent. */
  change7d?: number;
  /** The last 7 days, one point a day, each the change in percent since the first: what a sparkline draws. */
  spark?: number[];
  /** The exchange: the currency it trades against most, and how many of it one of that currency buys (`divine`, 4238
   * for a lifeforce). With the pair's own price it gives a second way to buy and sell: an arbitrage cycle. */
  pair?: { currency: string; rate: number };
  /** The exchange: poe.ninja's slug for its details page (`the-doctor`), which has each pair's daily rate and
   * volume: what `fetchTrades` reads to see which prices really trade. */
  details?: string;
  /** The game's picture of it, as a path on web.poecdn.com (`gen/image/…/Headhunter.png`). */
  icon?: string;
  /** Uniques: the item class the base belongs to ("Body Armour", "Ring"…), when known. */
  itemClass?: string;
  /** Bases: the item level the price is for (it is the minimum: higher sells at least as well). */
  itemLevel?: number;
  /** Bases: Shaper, Elder, Crusader, Redeemer, Hunter, Warlord; none when absent. */
  influence?: string;
}

/** A day's or an hour's prices for one league. */
export interface Snapshot {
  league: string;
  /** ISO time the prices were taken. */
  at: string;
  /** Chaos per divine orb, for the tiers and for people. */
  divine: number;
  prices: Price[];
}

/** One exchange item's days of trades, from poe.ninja's details page: what shows a price is one people pay. */
export interface Trades {
  /** The currency it trades in most (`chaos`, `divine`…). The days' rates are in it, so that a divine falling in
   * chaos does not look like every card it buys falling too. */
  pair: string;
  /** Oldest first; the last is the last 24 hours. */
  days: TradeDay[];
  /** Items that trade in both chaos and divines: each day both did, the price in divines (at the divine's price
   * that day) over the price in chaos, and the chaos traded in the thinner of the two. Oldest first. A ratio off
   * its usual is a cycle; how much the thinner pair trades is how much the cycle can take. */
  cross?: CrossDay[];
}

export interface TradeDay {
  /** yyyy-mm-dd. */
  day: string;
  /** Price of one in `Trades.pair`. */
  rate: number;
  /** Price of one in chaos, and in divines, that day. */
  chaos: number;
  divines: number;
  /** How many changed hands that day, over every pair. */
  volume: number;
}

export interface CrossDay {
  day: string;
  ratio: number;
  volume: number;
  /** The day's average rate in each pair: chaos for one in the chaos pair, divines for one in the divine pair, and
   * the divine's chaos price; with the chaos traded in each pair. What a cycle's legs are priced from. */
  chaos: number;
  divines: number;
  divine: number;
  chaosVolume: number;
  divineVolume: number;
}
