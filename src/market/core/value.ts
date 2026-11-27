// The one score every feature ranks by: how much a drop is worth once it is turned into chaos orbs.
//
//   worth = unit price × stack × liquidity − cost to sell
//
// - Liquidity (0–1) discounts what is hard to sell. On Faustus's exchange a trade fills at once, so currency and cards
//   go by how much of them trades a day, near 1 for most; an item waits for a buyer, so it is discounted by how many
//   others sell the same thing, more when its price swings, and to nothing with too few listings to be a price.
// - The cost to sell is a fixed number of chaos for the stash space, the wait and the trading: it is why a 10 c unique
//   nobody buys is worth about nothing late in a league.
//
// The numbers below are a first guess, to be tuned with saved prices and with what it feels like to pick things up.

import type { Price } from "./types";

/** What the model reads of a price: all the filter keeps of one too (src/filter.ts `filterInput`). */
export type Priced = Pick<Price, "kind" | "baseType" | "chaos" | "listings" | "volume" | "change7d">;

export interface ValueModel {
  /** Chaos it costs to sell one stack on the exchange, and one item on the trade site. */
  cost: { exchange: number; trade: number };
  /** Listings at which an item's liquidity is half of its best: fewer sellers means fewer buyers. */
  halfListings: { exchange: number; trade: number };
  /** Best liquidity, with many listings and a steady price. */
  ceiling: { exchange: number; trade: number };
  /** On the trade site, a 7-day swing of this many percent halves liquidity: the price you see may not be the one you
   * get by the time it sells. The exchange sells now, at today's price. */
  halfSwing: number;
  /** On the trade site, fewer listings than this are not a price (one seller asking a fortune): no liquidity. */
  minListings: number;
}

export const DEFAULT_MODEL: ValueModel = {
  cost: { exchange: 0.2, trade: 3 },
  halfListings: { exchange: 5, trade: 12 },
  ceiling: { exchange: 1, trade: 0.8 },
  halfSwing: 60,
  minListings: 5,
};

export function onExchange(price: Priced): boolean {
  return price.kind === "currency" || price.kind === "card";
}

/** The Chaos Orb is what everything is counted in: it needs no selling. */
const isChaos = (price: Priced) => price.kind === "currency" && price.baseType === "Chaos Orb";

/** 0–1: how surely and how soon the item turns into its price. */
export function liquidity(price: Priced, model: ValueModel = DEFAULT_MODEL): number {
  if (isChaos(price)) return 1;
  const market = onExchange(price) ? "exchange" : "trade";
  if (market === "trade" && price.listings < model.minListings) return 0;
  const depth = Math.max(price.volume ?? price.listings, 0);
  const sellers = depth / (depth + model.halfListings[market]);
  const swing = market === "trade" ? Math.abs(price.change7d ?? 0) : 0;
  const steadiness = model.halfSwing / (model.halfSwing + swing);
  return model.ceiling[market] * sellers * steadiness;
}

/** Chaos a stack of `stack` is worth, after liquidity and the cost to sell; can be below 0. */
export function worth(price: Priced, stack = 1, model: ValueModel = DEFAULT_MODEL): number {
  const market = onExchange(price) ? "exchange" : "trade";
  return price.chaos * stack * liquidity(price, model) - (isChaos(price) ? 0 : model.cost[market]);
}

/**
 * The smallest stack worth at least `chaos`, or undefined when no stack is (no liquidity): what `StackSize >=` takes.
 */
export function stackFor(price: Priced, chaos: number, model: ValueModel = DEFAULT_MODEL): number | undefined {
  const market = onExchange(price) ? "exchange" : "trade";
  const perOne = price.chaos * liquidity(price, model);
  if (!(perOne > 0)) return undefined;
  return Math.max(1, Math.ceil((chaos + (isChaos(price) ? 0 : model.cost[market])) / perOne - 1e-9));
}
