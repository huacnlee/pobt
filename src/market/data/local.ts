// What the app keeps on this device: the watchlist and its alerts, the ledger of trades, and settings.
import type { Kind, Opportunity, Risk } from "./types";
import { persisted } from "./persisted";

export interface Watch {
  id: string;
  name: string;
  /** Its picture, a path on the game's CDN. */
  icon?: string;
  kind: Kind;
  /** The price when it was added, to show the change since. */
  addedChaos: number;
  addedAt: string;
  /** Notify when the price goes at or above this, in chaos. */
  above?: number;
  /** Notify when it goes at or below this. */
  below?: number;
  alertsOn: boolean;
  /** The last price an alert fired at, so it fires once per crossing. */
  firedAt?: number;
}

export interface Trade {
  id: string;
  at: string;
  itemId: string;
  itemName: string;
  /** Its picture, a path on the game's CDN; trades written before pictures were kept have none. */
  icon?: string;
  qty: number;
  /** Chaos each, as bought. */
  buy: number;
  /** Chaos each, as sold; absent while held. */
  sell?: number;
  soldAt?: string;
  /** The opportunity it came from. */
  opportunityId?: string;
  note?: string;
}

export interface Settings {
  /** Where the game reads filters; empty for the platform's usual folder. */
  filterFolder: string;
  /** Minutes between checks of the alerts (the market itself updates at most hourly). */
  refreshMinutes: number;
  /** The filter's alert sounds: the game's, or the player's own files by tier (paths from the filter's folder). */
  filterSound?: "game" | "custom";
  filterSounds?: [string, string, string];
  /** Which kinds of opportunity notify when a new one appears, and the least profit and most risk it must have. */
  oppAlerts?: OpportunityAlerts;
}

export type OpportunityType = Opportunity["type"];

export interface OpportunityAlerts {
  dip: boolean;
  cycle: boolean;
  /** Chaos; absent for any. */
  minProfit?: number;
  /** Absent for any. */
  maxRisk?: Risk;
}

/** The opportunities already seen, so each new one notifies once. `primed` lists the types whose opportunities
 * listed at the time were taken in silently: turning a type on notifies only of those appearing after. */
export interface SeenOpportunities {
  primed: OpportunityType[];
  ids: string[];
}

export const watchlist = persisted<Watch[]>("market.watchlist", []);
export const ledger = persisted<Trade[]>("market.ledger", []);
export const settings = persisted<Settings>("market.settings", { filterFolder: "", refreshMinutes: 10 });
export const seenOpportunities = persisted<SeenOpportunities>("market.seenOpportunities", { primed: [], ids: [] });

export function isWatched(id: string): boolean {
  return watchlist().some((w) => w.id === id);
}

export function toggleWatch(item: { id: string; name: string; kind: Kind; chaos: number; icon?: string }): boolean {
  if (isWatched(item.id)) {
    watchlist.update((list) => list.filter((w) => w.id !== item.id));
    return false;
  }
  watchlist.update((list) => [
    { id: item.id, name: item.name, icon: item.icon, kind: item.kind, addedChaos: item.chaos, addedAt: new Date().toISOString(), alertsOn: false },
    ...list,
  ]);
  return true;
}

export function updateWatch(id: string, patch: Partial<Watch>) {
  watchlist.update((list) => list.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

export function addTrade(trade: Omit<Trade, "id" | "at">): Trade {
  const entry = { ...trade, id: crypto.randomUUID(), at: new Date().toISOString() };
  ledger.update((list) => [entry, ...list]);
  return entry;
}

export function updateTrade(id: string, patch: Partial<Trade>) {
  ledger.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function removeTrade(id: string) {
  ledger.update((list) => list.filter((t) => t.id !== id));
}

/** The ledger's totals: what was made on trades closed, and what is still held. */
export function ledgerTotals(trades: Trade[]) {
  let realized = 0;
  let held = 0;
  let wins = 0;
  let closed = 0;
  for (const t of trades) {
    if (t.sell === undefined) {
      held += t.buy * t.qty;
      continue;
    }
    const profit = (t.sell - t.buy) * t.qty;
    realized += profit;
    closed++;
    if (profit > 0) wins++;
  }
  return { realized, held, closed, winRate: closed ? wins / closed : 0 };
}

/** Which alerts a price crosses: a watch fires when it reaches a threshold, once until it leaves it. */
export function crossings(list: Watch[], prices: Map<string, number>): { watch: Watch; chaos: number; direction: "above" | "below" }[] {
  const fired: { watch: Watch; chaos: number; direction: "above" | "below" }[] = [];
  for (const w of list) {
    const chaos = prices.get(w.id);
    if (!w.alertsOn || chaos === undefined) continue;
    const hit = w.above !== undefined && chaos >= w.above ? "above" : w.below !== undefined && chaos <= w.below ? "below" : undefined;
    if (hit && w.firedAt === undefined) fired.push({ watch: w, chaos, direction: hit });
  }
  return fired;
}

const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2 };
/** How many seen ids are kept: enough that one leaving the list and coming back an hour later does not notify again. */
const SEEN_KEEP = 500;

/** The opportunities that are new since the last look and pass the alerts' thresholds, and what is seen after this
 * look. A type not yet primed takes in what is listed without notifying; a type turned off is forgotten as primed,
 * so turning it on again starts from what is listed then. */
export function newOpportunities(
  list: Opportunity[],
  alerts: OpportunityAlerts | undefined,
  seen: SeenOpportunities,
): { fresh: Opportunity[]; seen: SeenOpportunities } {
  const on = (["dip", "cycle"] as const).filter((type) => alerts?.[type]);
  const known = new Set(seen.ids);
  const fresh = list.filter(
    (o) =>
      on.includes(o.type) &&
      seen.primed.includes(o.type) &&
      !known.has(o.id) &&
      (alerts?.minProfit === undefined || o.profit >= alerts.minProfit) &&
      (alerts?.maxRisk === undefined || RISK_ORDER[o.risk] <= RISK_ORDER[alerts.maxRisk]),
  );
  const listed = list.filter((o) => on.includes(o.type)).map((o) => o.id);
  const ids = [...new Set([...listed, ...seen.ids])].slice(0, SEEN_KEEP);
  return { fresh, seen: { primed: on, ids } };
}
