// The market as the app shows it, made from a snapshot and the days before it: one row per price with what it is
// worth and how it moved, the anomalies worth a look, the trades worth making, and simple forecasts.
//
// Everything here is a pure function of its arguments, so the daily and hourly jobs (src/worker.ts) build the views
// and the API only streams them. The numbers are heuristics on public prices, not promises: every opportunity says
// its risk, and the app says that prices move.

import type { CrossDay, Kind, Price, Snapshot, Trades } from "./types";
import { DEFAULT_MODEL, type ValueModel, liquidity, onExchange, worth } from "./value";

/** Something about a price worth a second look. */
export type Tag =
  | "below7d" // 20% or more under its 7-day average
  | "above7d" // 20% or more over it
  | "volumeSpike" // traded or listed twice as much as its usual
  | "newHigh" // the highest in the 30 days kept
  | "newLow" // the lowest in them
  | "thin"; // too few sellers to be sure of the price

export interface Row {
  id: string;
  name: string;
  baseType: string;
  kind: Kind;
  category: string;
  chaos: number;
  divine: number;
  /** Exchange: traded a day, in items. Trade site: listings. */
  depth: number;
  liquidity: number;
  /** Chaos one is worth once sold: `worth()` of src/value.ts. */
  worth: number;
  /** About how many hours one takes to sell at this price. */
  sellHours: number;
  change1h?: number;
  change1d?: number;
  change7d?: number;
  /** The 7-day average, from the sparkline. */
  avg7d?: number;
  /** The usual depth over the days kept, for the volume spike. */
  depthAvg?: number;
  spark?: number[];
  tags: Tag[];
  itemClass?: string;
  itemLevel?: number;
  influence?: string;
  pair?: { currency: string; rate: number };
  /** The game's picture, a path on web.poecdn.com. */
  icon?: string;
}

export type Risk = "low" | "medium" | "high";

export interface Opportunity {
  id: string;
  type: "dip" | "cycle";
  title: string;
  /** The item bought; for a cycle, the one the cycle goes through. */
  itemId: string;
  itemName: string;
  buy: { price: number; where: "exchange" | "trade"; qty: number; cost: number; currency?: string };
  sell: { price: number; where: "exchange" | "trade"; currency?: string };
  /** Chaos expected after the cost of trading, if it sells at the target. */
  profit: number;
  /** Profit over what is put in. */
  roi: number;
  sellHours: number;
  risk: Risk;
  /** Why it is one, and what to do: keys and their values, worded by the app in its language. Values named `item`,
   * `from` and `to` are item names in English, which the app shows in its language too. */
  reasons: Phrase[];
  steps: Phrase[];
  /** A cycle's own trades, for the ring the app draws. */
  cycle?: Cycle;
}

/** A line of an opportunity: `key` names the wording, the rest fill it in (numbers already formatted). */
export type Phrase = { key: string } & Record<string, string>;

/** An arbitrage cycle: chaos → `via` → `item` → chaos (or the other way), and what one chaos comes back as. */
export interface Cycle {
  id: string;
  path: string[];
  ids: string[];
  /** Chaos back for one chaos put in, before the cost of trading. */
  ratio: number;
  /** In percent, after the cost of trading. */
  edge: number;
  volume: number;
  /** How much dearer the item usually is in divines than in chaos (1.05: 5%): taken off the divine pair's rate. */
  usual: number;
  /** The trades, one per arrow of `path`. */
  legs: CycleLeg[];
}

/** One trade of a cycle: `from` for `to` on the exchange, today. */
export interface CycleLeg {
  from: string;
  to: string;
  fromId: string;
  toId: string;
  /** How many `to` one `from` gets: today's average rate in that pair, the divine pair's less its usual premium. */
  rate: number;
  /** Today's average rate in that pair, when `rate` is not it (the divine pair's, premium and all). */
  quoted?: number;
  /** What changed hands in that pair today: `volume` of `unit` (the side that is not chaos), worth `volumeChaos`. */
  volume: number;
  unit: string;
  volumeChaos: number;
  /** What one chaos put in is worth after this trade, in chaos, with the trades so far paid for. */
  value: number;
}

export interface MarketView {
  league: string;
  at: string;
  divine: number;
  rows: Row[];
  opportunities: Opportunity[];
  cycles: Cycle[];
}

/** The days kept for one price: oldest first, today excluded. */
export interface History {
  chaos: number[];
  depth: number[];
}

/** A price's day in the history: [day, chaos, depth]. */
export type Point = [string, number, number];

const round = (n: number, digits = 4) => Number(n.toFixed(digits));

/** A price's id: poe.ninja's, or one made from what makes it unique when it has none. */
export function priceId(price: Price): string {
  if (price.id) return price.id;
  const parts = [price.kind, price.name, price.baseType !== price.name ? price.baseType : "", price.itemLevel ?? "", price.influence ?? ""];
  return parts.join(":").replace(/:+$/, "");
}

/** The prices a sparkline's points stand for, oldest first, ending at `chaos`. */
export function sparkPrices(chaos: number, spark?: number[]): number[] | undefined {
  if (!spark || spark.length < 2) return undefined;
  const last = spark[spark.length - 1];
  if (last <= -100) return undefined;
  const start = chaos / (1 + last / 100);
  return spark.map((d) => start * (1 + d / 100));
}

/**
 * About how many hours one sells in. The exchange fills at once while the day's volume is many times one; an item
 * on the trade site waits for one buyer among the sellers, longer the more there are and the more its price swings.
 */
export function sellHours(price: Price, model: ValueModel = DEFAULT_MODEL): number {
  const liq = liquidity(price, model);
  if (onExchange(price)) {
    const perDay = Math.max(price.volume ?? price.listings, 0);
    return perDay > 0 ? Math.min(72, Math.max(0.05, 24 / perDay)) : 72;
  }
  if (liq <= 0) return 72;
  // A tenth of the sellers sells a day at a fair price; fewer sellers, fewer buyers too.
  const hours = (2 + Math.sqrt(price.listings)) / liq;
  return Math.min(72, Math.max(0.25, hours));
}

/** A price's tags from its own numbers and its history. */
export function tagsOf(row: Omit<Row, "tags">, history?: History): Tag[] {
  const tags: Tag[] = [];
  if (row.avg7d) {
    if (row.chaos <= row.avg7d * 0.8) tags.push("below7d");
    else if (row.chaos >= row.avg7d * 1.2) tags.push("above7d");
  }
  if (row.depthAvg && row.depthAvg > 0 && row.depth >= row.depthAvg * 2 && row.depth >= 10) tags.push("volumeSpike");
  if (history && history.chaos.length >= 7) {
    if (row.chaos > Math.max(...history.chaos)) tags.push("newHigh");
    else if (row.chaos < Math.min(...history.chaos)) tags.push("newLow");
  }
  if (row.kind !== "currency" && row.kind !== "card" && row.depth < 5) tags.push("thin");
  return tags;
}

/** One price's row. `history` is its days before this one; `previous` its price an hour ago. */
export function toRow(
  price: Price,
  divine: number,
  history?: History,
  previous?: number,
  model: ValueModel = DEFAULT_MODEL,
): Row {
  const depth = onExchange(price) ? (price.volume ?? price.listings) : price.listings;
  const points = sparkPrices(price.chaos, price.spark);
  const avg7d = points ? points.reduce((a, b) => a + b, 0) / points.length : undefined;
  const change1d =
    points && points.length >= 2 && points[points.length - 2] > 0
      ? (price.chaos / points[points.length - 2] - 1) * 100
      : history?.chaos.length
        ? (price.chaos / history.chaos[history.chaos.length - 1] - 1) * 100
        : undefined;
  const recentDepth = history?.depth.slice(-7).filter((d) => d > 0);
  const row: Omit<Row, "tags"> = {
    id: priceId(price),
    name: price.name,
    baseType: price.baseType,
    kind: price.kind,
    category: price.category ?? price.kind,
    chaos: round(price.chaos),
    divine: round(price.chaos / divine, 5),
    depth: round(depth, 1),
    liquidity: round(liquidity(price, model), 3),
    worth: round(worth(price, 1, model), 2),
    sellHours: round(sellHours(price, model), 2),
    change1h: previous && previous > 0 ? round((price.chaos / previous - 1) * 100, 2) : undefined,
    change1d: change1d === undefined ? undefined : round(change1d, 2),
    change7d: price.change7d === undefined ? undefined : round(price.change7d, 2),
    avg7d: avg7d === undefined ? undefined : round(avg7d),
    depthAvg: recentDepth?.length ? round(recentDepth.reduce((a, b) => a + b, 0) / recentDepth.length, 1) : undefined,
    spark: price.spark?.map((d) => round(d, 2)),
    itemClass: price.itemClass,
    itemLevel: price.itemLevel,
    influence: price.influence,
    pair: price.pair,
    icon: price.icon,
  };
  return { ...row, tags: tagsOf(row, history) };
}


const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));

/** The rules a dip must pass: a price has to have been steady on real trades, then fallen on more of them. */
export const DIP = {
  /** Days before the drop that must be steady, at least, of the 7 looked at. */
  baseDays: 4,
  /** How far apart the steady days may be, the highest from the lowest, over their median. */
  maxSpread: 0.2,
  /** How much the steady days may have moved from the first to the last: more is a trend, and a fall in it a
   * falling knife. */
  maxTrend: 0.1,
  /** The drop, in the last two days, under the steady days' median: at least, and at most (more is news: a
   * patch, a nerf, a new way to farm it, and the price will not come back). */
  minDrop: 0.15,
  maxDrop: 0.5,
  /** The volume of the drop's days over the steady days': sellers dumped and buyers took them, so the low price
   * is one people pay, not one nobody wants. */
  minSpike: 1.5,
  /** The steady days' trades, in items and in divines' worth a day: enough to sell back into. */
  minVolume: 10,
  minDivinesTraded: 3,
  /** The least the target must be over the price, after the spread. */
  minMargin: 0.08,
  /** The least chaos expected, after the chance of not selling and the cost to trade. */
  minProfit: 10,
};

/**
 * What a price loses to the exchange's spread when sold back soon, from how much trades a day: a few percent for
 * what trades in thousands, up to 8% for what trades in tens. poe.ninja gives rates, not the order book: a guess.
 */
export function spreadOf(volume: number): number {
  return Math.min(0.08, Math.max(0.015, 0.015 + 0.3 / Math.sqrt(Math.max(volume, 1))));
}

/**
 * A dip on the exchange: steady for days on real trades, then fallen in the last two on more trades than usual.
 * The sell target is the steady days' traded price less the spread, priced in the pair the item trades in (a card
 * bought in divines has not dipped because the divine fell in chaos). Not a dip: a fall that was going before
 * (a falling knife), a fall on no volume, a fall too deep to be anything but news, and anything on the trade site,
 * whose prices are what sellers ask, with no trades to show what buyers pay.
 */
export function dipOf(row: Row, trades: Trades | undefined, divine: number, model: ValueModel = DEFAULT_MODEL): Opportunity | undefined {
  if (!trades || (row.kind !== "currency" && row.kind !== "card") || row.chaos < 1) return undefined;
  const days = trades.days;
  if (days.length < DIP.baseDays + 2) return undefined;
  const recent = days.slice(-2);
  const base = days.slice(-9, -2).filter((d) => d.volume > 0);
  if (base.length < DIP.baseDays) return undefined;
  const rates = base.map((d) => d.rate);
  const steady = median(rates);
  const spread = (Math.max(...rates) - Math.min(...rates)) / steady;
  const trend = rates[rates.length - 1] / rates[0] - 1;
  if (spread > DIP.maxSpread || Math.abs(trend) > DIP.maxTrend) return undefined;
  const last = recent[recent.length - 1];
  const drop = 1 - last.rate / steady;
  if (drop < DIP.minDrop || drop > DIP.maxDrop) return undefined;
  // It must have fallen against the divine too: in a league where chaos gains 5% a day on the divine, everything
  // priced in chaos falls with nothing wrong with it, and comes back only if chaos does.
  const steadyDivines = median(base.map((d) => d.divines));
  if (1 - last.divines / steadyDivines < DIP.minDrop) return undefined;
  const usual = median(base.map((d) => d.volume));
  const onDrop = Math.max(...recent.map((d) => d.volume));
  // What the steady days are worth in chaos now: in the pair (at the pair's price now, from the item's), and in
  // divines (at the divine's now); the lower of the two, so neither the pair nor chaos has to move back.
  const steadyChaos = Math.min(steady * (row.chaos / last.rate), steadyDivines * divine);
  if (usual < DIP.minVolume || usual * steadyChaos < DIP.minDivinesTraded * divine) return undefined;
  if (onDrop < usual * DIP.minSpike) return undefined;
  const cut = spreadOf(usual);
  const target = steadyChaos * (1 - cut);
  if (target / row.chaos - 1 < DIP.minMargin) return undefined;
  // No more than a twentieth of a usual day, and about two divines' worth.
  const qty = Math.max(1, Math.floor(Math.min(usual * 0.05, (2 * divine) / row.chaos)));
  // How likely all of it sells at the target: more of a day's volume, less likely.
  const fill = usual / (usual + 10 * qty);
  const profit = (target - row.chaos) * qty * fill - model.cost.exchange * 2;
  if (profit < DIP.minProfit) return undefined;
  const risk: Risk = drop <= 0.25 && usual >= 100 && spread <= 0.1 ? "low" : drop > 0.35 ? "high" : "medium";
  const cost = row.chaos * qty;
  const pairName = trades.pair === "divine" ? "Divine Orb" : trades.pair === "chaos" ? "Chaos Orb" : trades.pair;
  return {
    id: `dip:${row.id}`,
    type: "dip",
    title: `Dip: ${row.name}`,
    itemId: row.id,
    itemName: row.name,
    buy: { price: row.chaos, where: "exchange", qty, cost: round(cost, 2) },
    sell: { price: round(target, 4), where: "exchange" },
    profit: round(profit, 2),
    roi: round(profit / cost, 4),
    sellHours: round(Math.min(72, 24 + (24 * qty) / usual), 2),
    risk,
    reasons: [
      { key: "steadyThenDrop", days: String(base.length), average: fmt(steadyChaos), percent: String(Math.round(drop * 100)) },
      { key: "volumeOnDrop", ratio: (onDrop / usual).toFixed(1) },
      { key: "tradedDaily", qty: String(Math.round(usual)) },
      ...(trades.pair !== "chaos" ? [{ key: "pricedInPair", item: pairName }] : []),
      { key: "fillChance", percent: String(Math.round(fill * 100)) },
      { key: `risk.${risk}` },
    ],
    steps: [
      { key: "buyOnExchange", price: fmt(row.chaos), qty: String(qty), item: row.name },
      { key: "listAtTraded", price: fmt(target), average: fmt(steadyChaos), percent: (cut * 100).toFixed(1) },
      { key: "cutLoss", price: fmt(row.chaos * 0.9) },
      { key: "collectFromExchange" },
      { key: "record" },
    ],
  };
}

/** Every dip among the rows that have days of trades. */
export function dips(rows: Row[], trades: Map<string, Trades>, divine: number, model: ValueModel = DEFAULT_MODEL): Opportunity[] {
  return rows
    .flatMap((row) => dipOf(row, trades.get(row.id), divine, model) ?? [])
    .sort((a, b) => b.profit - a.profit);
}

/**
 * Which exchange prices are worth a request for their days of trades: those whose sparkline (in their pair) ends
 * well under its first days, the dips' candidates, and the most traded, which may trade at two rates in two pairs
 * (a cycle). Enough traded to matter, at most `limit`, so the hourly job asks poe.ninja for few pages.
 */
export function wantTrades(snapshot: Snapshot, limit = 24): Price[] {
  const divine = snapshot.prices.find((p) => p.kind === "currency" && p.name === "Divine Orb");
  const divinePoints = divine ? sparkPrices(divine.chaos, divine.spark) : undefined;
  const traded = (p: Price) => (p.volume ?? 0) * p.chaos;
  const pool = snapshot.prices.filter(
    (p) => onExchange(p) && p.details && p.id && p.chaos >= 1 && traded(p) >= DIP.minDivinesTraded * snapshot.divine && p.name !== "Divine Orb",
  );
  const dipping = pool.filter((p) => {
    const points = sparkPrices(p.chaos, p.spark);
    if (!points || points.length < 5 || divinePoints?.length !== points.length) return false;
    // Fallen in chaos and in divines both, as `dipOf` asks, a little less to leave it the last word.
    const fell = (xs: number[]) => xs[xs.length - 1] <= median(xs.slice(0, -2)) * (1 - DIP.minDrop + 0.03);
    return fell(points) && fell(points.map((x, i) => x / divinePoints[i]));
  });
  const busiest = pool.filter((p) => !dipping.includes(p)).sort((a, b) => traded(b) - traded(a));
  dipping.sort((a, b) => traded(b) - traded(a));
  const cycleSlots = Math.min(8, Math.floor(limit / 3));
  const picked = dipping.slice(0, limit - cycleSlots);
  return [...picked, ...busiest.slice(0, limit - picked.length)];
}

/** An arbitrage cycle through one item that trades in both chaos and divines, at rates that disagree more than
 * they usually do. */
export const CYCLE = {
  /** Percent, after the cost of trading. */
  minEdge: 2,
  /** Each trade on the exchange costs about a few tenths of a percent in rounding and the spread. */
  feePerTrade: 0.5,
  /** Days before today the gap must have been steady on, at least, and how far apart (highest from lowest). */
  usualDays: 4,
  maxUsualSpread: 0.05,
  /** Chaos a day the thinner pair must trade, in divines' worth: a loop is only as deep as it. */
  minDivinesTraded: 10,
  /** The most the item's price may have moved since yesterday: each pair's rate is a day's average, and a price on
   * the move makes the pair that traded earlier look dear or cheap against the other. */
  maxDayMove: 0.05,
};

/**
 * Cycles through items traded in chaos and in divines: buy it in one, sell it in the other, change back. The two
 * prices are never equal: the one in divines is a few percent over the one in chaos day after day, on millions of
 * chaos traded, which is how the exchange quotes and not a gift. Only a gap off its usual, when the usual was
 * steady, is a cycle, and the thinner pair's volume is how much it can take. Without days of trades (`trades`)
 * there is none: the overview's chaos price is itself made from the main pair.
 */
export function cycles(rows: Row[], trades: Map<string, Trades>, divine: number): Cycle[] {
  const out: Cycle[] = [];
  for (const row of rows) {
    const t = trades.get(row.id);
    const cross = t?.cross;
    if (!t || !cross || cross.length < CYCLE.usualDays + 1 || row.chaos <= 0) continue;
    const [yesterday, last] = t.days.slice(-2);
    if (!yesterday || Math.abs(last.rate / yesterday.rate - 1) > CYCLE.maxDayMove) continue;
    const today = cross[cross.length - 1];
    if (today.volume < CYCLE.minDivinesTraded * divine) continue;
    const before = cross.slice(-8, -1).map((d) => d.ratio);
    if (before.length < CYCLE.usualDays || Math.max(...before) - Math.min(...before) > CYCLE.maxUsualSpread) continue;
    // Over one: the price in divines is dearer than usual, so buy in chaos and sell for divines.
    const off = today.ratio / median(before);
    const forward = off >= 1;
    const ratio = forward ? off : 1 / off;
    const edge = (ratio - 1) * 100 - 3 * CYCLE.feePerTrade;
    if (edge < CYCLE.minEdge) continue;
    const path = forward ? ["Chaos Orb", row.name, "Divine Orb", "Chaos Orb"] : ["Chaos Orb", "Divine Orb", row.name, "Chaos Orb"];
    const ids = forward
      ? ["Currency:chaos", row.id, "Currency:divine", "Currency:chaos"]
      : ["Currency:chaos", "Currency:divine", row.id, "Currency:chaos"];
    const usual = median(before);
    const legs = cycleLegs(row, today, usual, forward, rows.find((r) => r.id === "Currency:divine")?.depth ?? 0);
    out.push({
      id: `cycle:${ids.join(">")}`,
      path,
      ids,
      ratio: round(ratio, 5),
      edge: round(edge, 2),
      volume: round(today.volume / row.chaos, 1),
      usual: round(usual, 4),
      legs,
    });
  }
  return out.sort((a, b) => b.edge - a.edge);
}

const sig = (n: number) => Number(n.toPrecision(6));

/**
 * A cycle's three trades, from today's rates in each pair. The divine pair's rate is taken as `usual` times worse
 * than quoted (its usual premium is how the exchange quotes, not a gift), so the loop comes back at the cycle's
 * `ratio`, and each trade takes `CYCLE.feePerTrade` percent of the chaos put in: the last value is `1 + edge`.
 * `divinesTraded` is the divine's own day on the exchange, in divines.
 */
function cycleLegs(row: Row, day: CrossDay, usual: number, forward: boolean, divinesTraded: number): CycleLeg[] {
  const fee = CYCLE.feePerTrade / 100;
  const chaosPair = { volume: sig(day.chaosVolume / day.chaos), unit: row.name, volumeChaos: Math.round(day.chaosVolume) };
  const divinePair = { volume: sig(day.divineVolume / (day.divines * day.divine)), unit: row.name, volumeChaos: Math.round(day.divineVolume) };
  const divineChaos = { volume: Math.round(divinesTraded), unit: "Divine Orb", volumeChaos: Math.round(divinesTraded * day.divine) };
  const chaos = { name: "Chaos Orb", id: "Currency:chaos" };
  const divine = { name: "Divine Orb", id: "Currency:divine" };
  const item = { name: row.name, id: row.id };
  const leg = (from: typeof chaos, to: typeof chaos, rate: number, value: number, pair: typeof chaosPair, quoted?: number): CycleLeg => ({
    from: from.name,
    to: to.name,
    fromId: from.id,
    toId: to.id,
    rate: sig(rate),
    ...(quoted !== undefined ? { quoted: sig(quoted) } : {}),
    ...pair,
    value: round(value, 5),
  });
  // Chaos one chaos is worth after each trade, before fees: the item at its chaos price, a divine at its own.
  const through = (day.divines * day.divine) / (day.chaos * usual);
  if (forward) {
    return [
      leg(chaos, item, 1 / day.chaos, 1 - fee, chaosPair),
      leg(item, divine, day.divines / usual, through - 2 * fee, divinePair, day.divines),
      leg(divine, chaos, day.divine, through - 3 * fee, divineChaos),
    ];
  }
  return [
    leg(chaos, divine, 1 / day.divine, 1 - fee, divineChaos),
    leg(divine, item, usual / day.divines, 1 / through - 2 * fee, divinePair, 1 / day.divines),
    leg(item, chaos, day.chaos, 1 / through - 3 * fee, chaosPair),
  ];
}

/** A cycle as an opportunity: what to put in, at most a fiftieth of what the thinner pair trades a day. */
export function cycleOpportunity(cycle: Cycle, rows: Map<string, Row>, divine: number): Opportunity {
  const itemId = cycle.ids.find((id) => id !== "Currency:chaos" && id !== "Currency:divine") ?? cycle.ids[1];
  const item = rows.get(itemId);
  const daily = cycle.volume * (item?.chaos ?? 0);
  const stake = Math.min(divine * 2, Math.max(divine * 0.2, daily * 0.02));
  const profit = (stake * cycle.edge) / 100;
  return {
    id: cycle.id,
    type: "cycle",
    title: `Cycle: ${cycle.path.join(" → ")}`,
    itemId,
    itemName: item?.name ?? cycle.path[1],
    buy: { price: rows.get(cycle.ids[1])?.chaos ?? (cycle.ids[1] === "Currency:divine" ? divine : 0), where: "exchange", qty: 1, cost: round(stake, 2), currency: cycle.path[1] },
    sell: { price: 1, where: "exchange", currency: "Chaos Orb" },
    profit: round(profit, 2),
    roi: round(cycle.edge / 100, 4),
    sellHours: 0.5,
    risk: cycle.edge > 5 ? "medium" : "low",
    cycle,
    reasons: [
      { key: "cycleOffUsual", ratio: cycle.ratio.toFixed(3) },
      { key: "cycleEdge", percent: cycle.edge.toFixed(1) },
      { key: "pairVolume", price: fmt(daily) },
      { key: "spreadMayVanish" },
    ],
    steps: [
      { key: "cycleStart", price: fmt(stake), item: cycle.path[1] },
      { key: "cycleTrade", from: cycle.path[1], to: cycle.path[2] },
      { key: "cycleTrade", from: cycle.path[2], to: cycle.path[3] },
      { key: "checkRate" },
      { key: "record" },
    ],
  };
}

/**
 * Every row, the opportunities among them and the cycles, for one snapshot. Opportunities come only from `trades`,
 * the days of trades fetched for the prices `wantTrades` picks: without them there are none, which is better than
 * ones made from asking prices.
 */
export function buildView(
  snapshot: Snapshot,
  history: Map<string, History> = new Map(),
  previous: Map<string, number> = new Map(),
  model: ValueModel = DEFAULT_MODEL,
  trades: Map<string, Trades> = new Map(),
): MarketView {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const price of snapshot.prices) {
    const id = priceId(price);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(toRow(price, snapshot.divine, history.get(id), previous.get(id), model));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = cycles(rows, trades, snapshot.divine);
  const opportunities = [...found.slice(0, 20).map((c) => cycleOpportunity(c, byId, snapshot.divine)), ...dips(rows, trades, snapshot.divine, model)]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 100);
  return { league: snapshot.league, at: snapshot.at, divine: snapshot.divine, rows, opportunities, cycles: found.slice(0, 50) };
}

export type Period = "1h" | "1d" | "7d";

const changeOf = (row: Row, period: Period) =>
  period === "1h" ? row.change1h : period === "1d" ? row.change1d : row.change7d;

/** The biggest moves up and down, among things that trade enough to matter. */
/** Below these, a price is a handful of listings at the floor, and its swings of 90% say nothing. */
export const MOVER_LIQUIDITY = 0.4;
export const MOVER_MIN_CHAOS = 2;

export function movers(rows: Row[], period: Period, kind?: Kind, limit = 20): { up: Row[]; down: Row[] } {
  const moving = rows.filter(
    (r) => (!kind || r.kind === kind) && changeOf(r, period) !== undefined && r.liquidity >= MOVER_LIQUIDITY && r.chaos >= MOVER_MIN_CHAOS,
  );
  const sorted = moving.sort((a, b) => changeOf(b, period)! - changeOf(a, period)!);
  return {
    up: sorted.filter((r) => changeOf(r, period)! > 0).slice(0, limit),
    down: sorted.filter((r) => changeOf(r, period)! < 0).reverse().slice(0, limit),
  };
}

export interface Forecast {
  /** Days ahead. */
  days: number;
  chaos: number;
  low: number;
  high: number;
  /** 0–1: how well a straight line fits the days kept, and how many there are. */
  confidence: number;
  trend: "up" | "down" | "flat";
}

/**
 * A straight line through the log of the last prices, carried `days` ahead: a trend, not a prophecy. The band is the
 * line's typical miss; the confidence falls with a poor fit and with few days.
 */
export function forecast(prices: number[], days = 3): Forecast | undefined {
  const ys = prices.filter((p) => p > 0).slice(-14).map(Math.log);
  const n = ys.length;
  if (n < 4) return undefined;
  const xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  const fit = xs.map((x) => my + slope * (x - mx));
  const ssRes = ys.reduce((a, y, i) => a + (y - fit[i]) ** 2, 0);
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const sd = Math.sqrt(ssRes / Math.max(1, n - 2));
  const at = my + slope * (n - 1 - mx + days);
  const perDay = (Math.exp(slope) - 1) * 100;
  return {
    days,
    chaos: round(Math.exp(at)),
    low: round(Math.exp(at - 1.5 * sd)),
    high: round(Math.exp(at + 1.5 * sd)),
    confidence: round(Math.max(0, Math.min(1, r2)) * Math.min(1, n / 10), 2),
    trend: perDay > 1 ? "up" : perDay < -1 ? "down" : "flat",
  };
}

/** The cheap and the dear ends of the prices kept: under the 20th percentile, over the 80th. */
export function zones(prices: number[]): { cheap: number; dear: number } | undefined {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return undefined;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return { cheap: round(at(0.2)), dear: round(at(0.8)) };
}

/** Adds a day to a price's days, keeping the last `keep`; the same day again replaces it. */
export function appendDay(points: Point[] | undefined, day: string, chaos: number, depth: number, keep = 120): Point[] {
  const out = (points ?? []).filter((p) => p[0] !== day);
  out.push([day, round(chaos), round(depth, 1)]);
  return out.slice(-keep);
}

/** A price's last 30 days before `day`, as `History`. */
export function historyOf(points: Point[] | undefined, before: string): History | undefined {
  const kept = (points ?? []).filter((p) => p[0] < before).slice(-30);
  return kept.length ? { chaos: kept.map((p) => p[1]), depth: kept.map((p) => p[2]) } : undefined;
}
