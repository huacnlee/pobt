// The market's types: those of core/, which the app computes with, and the app's views of them.
export type { Kind } from "../core/types";
export type { Cycle, CycleLeg, Forecast, Opportunity, Period, Phrase, Risk, Row, Tag } from "../core/market";
export type { Brief, HeatCell, RowsFile, Summary } from "../core/views";
import type { Cycle, Forecast, Opportunity, Row } from "../core/market";

export interface OpportunitiesFile {
  league: string;
  at: string;
  divine: number;
  opportunities: Opportunity[];
  cycles: Cycle[];
}

export interface ItemDetail {
  league: string;
  at: string;
  divine: number;
  row: Row;
  history: { day: string; chaos: number; depth: number; leagueDay?: number }[];
  /** Where the days came from: those kept on this device, or poe.ninja's days of trades (before a few are kept). */
  source: "local" | "ninja";
  zones?: { cheap: number; dear: number };
  forecast?: Forecast | null;
  /** Other leagues with days kept on this device, to compare with. */
  seasons: string[];
  season?: { league: string; points: { day: number; chaos: number }[] };
}
