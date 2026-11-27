// The market's views, as the app shows them: the overview (heat map, movers, anomalies), a kind's rows, the
// opportunities. Pure functions of a `MarketView` (src/market.ts), so the jobs (src/publish.ts) and the desktop app,
// which computes them on the device, make the same files.

import { type Cycle, type MarketView, type Opportunity, type Period, type Row, movers } from "./market";
import type { Kind } from "./types";

export const KINDS: Kind[] = ["currency", "card", "unique", "base"];
const PERIODS: Period[] = ["1h", "1d", "7d"];

/** A row in short, for lists that do not need everything. */
export type Brief = Pick<
  Row,
  "id" | "name" | "kind" | "category" | "chaos" | "divine" | "change1h" | "change1d" | "change7d" | "spark" | "tags" | "liquidity" | "depth" | "icon"
>;

export interface HeatCell {
  id: string;
  name: string;
  kind: Kind;
  category: string;
  /** Chaos a day changes hands (the exchange), or chaos listed and likely to sell (the trade site). */
  value: number;
  change?: number;
}

export interface Summary {
  league: string;
  at: string;
  divine: number;
  counts: Record<Kind, number>;
  heatmap: HeatCell[];
  movers: Record<Period, { up: Brief[]; down: Brief[] }>;
  anomalies: Brief[];
  opportunities: number;
  cycles: number;
}

export interface RowsFile {
  league: string;
  at: string;
  divine: number;
  kind: Kind;
  rows: Row[];
}

export interface OpportunitiesFile {
  league: string;
  at: string;
  divine: number;
  opportunities: Opportunity[];
  cycles: Cycle[];
}

const brief = (r: Row): Brief => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  category: r.category,
  chaos: r.chaos,
  divine: r.divine,
  change1h: r.change1h,
  change1d: r.change1d,
  change7d: r.change7d,
  spark: r.spark,
  tags: r.tags,
  liquidity: r.liquidity,
  depth: r.depth,
  icon: r.icon,
});

/** What a row trades for a day, in chaos: the size of its cell in the heat map. */
export function tradedValue(r: Row): number {
  return r.kind === "currency" || r.kind === "card" ? r.chaos * r.depth : r.chaos * r.depth * r.liquidity * 0.1;
}

export function summarize(view: MarketView, cells = 80): Summary {
  const counts = { currency: 0, card: 0, unique: 0, base: 0 } as Record<Kind, number>;
  for (const r of view.rows) counts[r.kind]++;
  const ranked = view.rows.filter((r) => !(r.kind === "currency" && r.name === "Chaos Orb")).sort((a, b) => tradedValue(b) - tradedValue(a));
  const heatmap = ranked.slice(0, cells).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    category: r.category,
    value: Math.round(tradedValue(r)),
    change: r.change1d,
  }));
  const moves = Object.fromEntries(
    PERIODS.map((p) => {
      const m = movers(view.rows, p, undefined, 10);
      return [p, { up: m.up.map(brief), down: m.down.map(brief) }];
    }),
  ) as Summary["movers"];
  const anomalies = ranked.filter((r) => r.tags.some((t) => t !== "thin") && r.liquidity >= 0.3).slice(0, 30).map(brief);
  return {
    league: view.league,
    at: view.at,
    divine: view.divine,
    counts,
    heatmap,
    movers: moves,
    anomalies,
    opportunities: view.opportunities.length,
    cycles: view.cycles.length,
  };
}

/**
 * A kind's rows for its file. Bases come in every item level and influence, most with nobody selling: only those
 * worth something once sold are kept, about a sixth of them, so the file stays small enough for the app.
 */
export function rowsFor(view: MarketView, kind: Kind): Row[] {
  return view.rows.filter((r) => r.kind === kind && (kind !== "base" || r.worth > 0));
}

