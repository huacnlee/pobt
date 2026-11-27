/** What a price is for: decides how it sells (exchange or trade) and how the filter matches it. */
export type Kind =
  | "currency" // orbs, shards, lifeforce, oils, fossils, essences, scarabs…: stackable, sold on Faustus's exchange
  | "card" // divination cards: stackable, sold on the exchange
  | "unique" // the filter only sees the base type
  | "base"; // a crafting base: base type, item level, influence

/** One price, from any source, as the value model reads it. */
export interface Price {
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
