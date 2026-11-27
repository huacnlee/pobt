// Each day's prices, kept on this device so the history grows the longer the app is used: one small file a day and a
// league, the last 60 days. Every price of the day is in it (not only the rows shown), as two arrays of numbers
// aligned with the league's list of ids, which only grows:
//
//   history/<league>/ids.json        ["Currency:divine", "UniqueArmour:123", …]
//   history/<league>/<yyyy-mm-dd>.json  { "c": [150, 3.2, …], "d": [5000, 12, …] }   chaos and depth, 0 for none
//
// A day written again (a later update the same day) replaces it, so a day holds its last prices.
import { type History, type Point, priceId } from "../core/market";
import type { Snapshot } from "../core/types";
import { list, readJson, remove, writeJson } from "./store";

export const KEEP_DAYS = 60;
/** The days before today a view reads (tags, the usual volume), as core/market.ts reads them. */
const VIEW_DAYS = 30;

interface DayFile {
  c: number[];
  d: number[];
}

const folder = (league: string) => `history/${encodeURIComponent(league)}`;
const isDay = (name: string) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name);
/** Four significant digits: what a chart and a 20% tag need, at about half the size. */
const short = (n: number) => (n > 0 ? Number(n.toPrecision(4)) : 0);
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The leagues with days kept, and the first and last of them. */
export async function leagues(): Promise<{ league: string; start: string; last: string }[]> {
  const out = [];
  for (const name of await list("history")) {
    const days = (await list(`history/${name}`)).filter(isDay);
    if (days.length) out.push({ league: decodeURIComponent(name), start: days[0].slice(0, 10), last: days[days.length - 1].slice(0, 10) });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

async function daysOf(league: string): Promise<string[]> {
  return (await list(folder(league))).filter(isDay).map((n) => n.slice(0, 10));
}

/** Adds the snapshot's day, and forgets days older than `KEEP_DAYS`. */
export async function recordDay(snapshot: Snapshot): Promise<void> {
  const base = folder(snapshot.league);
  const ids = (await readJson<string[]>(`${base}/ids.json`)) ?? [];
  const index = new Map(ids.map((id, i) => [id, i]));
  const c: number[] = new Array(ids.length).fill(0);
  const d: number[] = new Array(ids.length).fill(0);
  for (const price of snapshot.prices) {
    const id = priceId(price);
    let i = index.get(id);
    if (i === undefined) {
      i = ids.length;
      ids.push(id);
      index.set(id, i);
    }
    c[i] = short(price.chaos);
    d[i] = short(price.volume ?? price.listings);
  }
  const day = snapshot.at.slice(0, 10);
  await writeJson(`${base}/ids.json`, ids);
  await writeJson(`${base}/${day}.json`, { c, d } satisfies DayFile);
  const days = await daysOf(snapshot.league);
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) await remove(`${base}/${old}.json`);
}

/** Each price's days before `day` (the last 30), as the view reads them. Yields between files. */
export async function historyBefore(league: string, day: string): Promise<Map<string, History>> {
  const base = folder(league);
  const ids = (await readJson<string[]>(`${base}/ids.json`)) ?? [];
  const out = new Map<string, History>();
  const days = (await daysOf(league)).filter((d) => d < day).slice(-VIEW_DAYS);
  for (const d of days) {
    const file = await readJson<DayFile>(`${base}/${d}.json`);
    if (!file) continue;
    for (let i = 0; i < file.c.length; i++) {
      if (!(file.c[i] > 0)) continue;
      let h = out.get(ids[i]);
      if (!h) out.set(ids[i], (h = { chaos: [], depth: [] }));
      h.chaos.push(file.c[i]);
      h.depth.push(file.d[i]);
    }
    await tick();
  }
  return out;
}

/** One price's days in a league, oldest first: [day, chaos, depth]. */
export async function pointsOf(league: string, id: string): Promise<Point[]> {
  const base = folder(league);
  const ids = (await readJson<string[]>(`${base}/ids.json`)) ?? [];
  const i = ids.indexOf(id);
  if (i < 0) return [];
  const out: Point[] = [];
  for (const d of await daysOf(league)) {
    const file = await readJson<DayFile>(`${base}/${d}.json`);
    if (file && file.c[i] > 0) out.push([d, file.c[i], file.d[i]]);
    await tick();
  }
  return out;
}
