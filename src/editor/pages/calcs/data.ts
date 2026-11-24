// What the Calcs page reads from POB's own Calcs tab (ext/pobt-native/src/service/calcs.lua): its sections, rows and
// cells as POB draws them, its skill controls, and a cell's breakdown.
import { colorRuns, plain } from "../../ColoredText";
import type { TipLine } from "../../PobTip";
import type { Control } from "../../session";

export type Cell = { col: number; text: string; detail?: boolean };
/** A control of the Calcs tab's skill selection, with its path from the build for `act`. */
export type CalcControl = Control & { name: string; path: (string | number)[]; tooltip?: string };
export type Row = { row: number; label?: string; color?: string; cells: Cell[]; controls?: CalcControl[] };
export type Sub = { id: string; label: string; collapsed: boolean; extra?: string; rows: Row[] };
export type SectionData = { id: string; group: number; colour: string; cols: number; enabled: boolean; subsections: Sub[] };
export type CalcsData = { sections: SectionData[]; showMinion: boolean; revision: number };

/** A cell, by `read`'s 1-based numbers. */
export type Target = { section: number; sub: number; row: number; col: number };

export type TableRow = { [key: string]: string | TipLine[] | undefined; tip?: TipLine[] };
export type Part =
  | { type: "TEXT"; lines: string[] }
  | { type: "RADIUS"; radius: number }
  | { type: "TABLE"; label?: string; footer?: string; columns: { key: string; label: string; right?: boolean }[]; rows: TableRow[]; more?: number };

export const targetKey = (t: Target) => `${t.section}:${t.sub}:${t.row}:${t.col}`;
export function parseKey(key: string): Target {
  const [section, sub, row, col] = key.split(":").map(Number);
  return { section: section!, sub: sub!, row: row!, col: col! };
}

/** POB's `^xRRGGBB` as a colour. */
export const hex = (code: string | undefined) => (code ? colorRuns(`${code}.`)[0]?.color : undefined);

/** A row of column titles across damage types (the first row of a wide section): no label, nothing to break down. */
export const isHeaderRow = (r: Row) => !r.label && !r.controls && r.cells.length > 0 && r.cells.every((c) => !c.detail);

/** The first cell of a row that has a breakdown. */
export const detailCell = (r: Row) => r.cells.find((c) => c.detail);

/** The rows shown as stats (not the skill selection's controls). */
export const statRows = (sub: Sub) => sub.rows.filter((r) => !r.controls);

export const label = (s: string | undefined) => plain(s ?? "").replace(/:$/, "").trim();
