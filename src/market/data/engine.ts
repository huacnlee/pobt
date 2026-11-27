// The market, made on this device: poe.ninja's pages fetched while the app is in use, at most once an hour, and
// everything the app shows computed from them with the code in core/ (ninja.ts parses, market.ts
// makes the rows, opportunities and cycles, views.ts the overview, filter.ts the loot filter). What it computed is kept
// in the app's data folder (store.ts), so a start shows the last market at once and only fetches when it is older
// than an hour; each day's prices go to the local history (history.ts). poe.ninja's answers are kept too, as they came
// (cache.ts): an update asks for each page conditionally, and when none changed it computes nothing; offline, what
// was kept stays on screen with its age.
//
// An update: the league (1 request), the 20 overview pages one after another, then the details pages of the exchange
// items worth a closer look (`wantTrades`, about 25), the days of trades the opportunities are made from. The work
// between pages is split into chunks with a turn of the event loop between them, so the window stays responsive; the
// progress (`progress()`) says how far it is.
import { effect, lifecycle, signal, Storage, untracked } from "nsh";
import type { FilterInput } from "../core/filter";
import { filterInput } from "../core/filter";
import {
  type History,
  type MarketView,
  type Opportunity,
  type Row,
  cycleOpportunity,
  cycles,
  dips,
  forecast,
  priceId,
  sparkPrices,
  toRow,
  wantTrades,
  zones,
} from "../core/market";
import { fetchTrades, parsePage, type Source, sources, toSnapshot } from "../core/ninja";
import type { Kind, Snapshot, TradeDay, Trades } from "../core/types";
import { KINDS, type RowsFile, type Summary, rowsFor, summarize } from "../core/views";
import { historyBefore, leagues, pointsOf, recordDay } from "./history";
import { clearArt } from "./art";
import { CACHE, FRESH_MINUTES, getPage, type Page } from "./cache";
import { errorText, isOffline } from "./ninja";
import { dataFolder, pathOf, readJson, removeAll, sizeOf, writeJson } from "./store";
import type { ItemDetail, OpportunitiesFile } from "./types";

/** The market is fetched at most once in this many minutes, and only while the app runs. */
export const REFRESH_MINUTES = 60;
/** After a failed update, the next may start this soon (doubling with each failure, up to the hour). */
const RETRY_MINUTES = 2;
/** When the last fetch started: in Storage, not with the data, so clearing the data does not reset the limit. */
const LAST_FETCH = "market.lastFetch";

const INDEX = "https://poe.ninja/poe1/api/data/index-state";

export interface Meta {
  league: string;
  /** When the prices were taken (ISO). */
  at: string;
  divine: number;
  /** When poe.ninja was last asked and answered (ISO): the prices may be older when nothing changed since. */
  checkedAt?: string;
  /** The details pages the market was made from, asked again to tell whether anything changed. */
  details?: string[];
}

/** When the market shown was last known to be current: the last check, else when its prices were taken. */
export const checkedAt = (m: Meta) => m.checkedAt ?? m.at;

export type Phase = "fetching" | "computing";
export interface Progress {
  phase: Phase;
  done: number;
  total: number;
}

const meta = signal<Meta | null>(null);
const updating = signal(false);
const progress = signal<Progress | null>(null);
const failure = signal<string | null>(null);
/** Whether the last update failed for want of a network (the market kept is shown as offline). */
const offline = signal(false);
/** Moves each time new data is in: what pages read to show it. */
const version = signal(1);
const lastFetch = signal<number | null>(null);

let failures = 0;
let lastFailure = 0;
let lastError: Error | null = null;
let running: Promise<void> | null = null;
let started: Promise<void> | null = null;
const listeners = new Set<(meta: Meta) => void>();

// What was read or computed, kept while the app runs.
let memory: {
  summary?: Summary;
  opportunities?: OpportunitiesFile;
  rows: Map<Kind, RowsFile>;
  filter?: FilterInput;
  trades?: Record<string, TradeDay[]>;
} = { rows: new Map() };

export const engine = {
  meta: () => meta(),
  updating: () => updating(),
  progress: () => progress(),
  /** The last update's error, while there is one. */
  failure: () => failure(),
  offline: () => offline(),
  version: () => version(),
  lastFetch: () => lastFetch(),
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Rows made or lines read between two turns of the event loop. */
const CHUNK = 2000;

/**
 * When the next update may fetch, in ms since the epoch. An hour after the last fetch; sooner after a failure (that
 * hour's market never came), and at once when there is no market at all (the first start, or after clearing it).
 */
export function nextUpdateAt(): number {
  const last = lastFetch();
  const byLimit = last === null || !meta() ? 0 : last + REFRESH_MINUTES * 60_000;
  if (!failures) return byLimit;
  const backoff = lastFailure + Math.min(REFRESH_MINUTES, RETRY_MINUTES * 2 ** (failures - 1)) * 60_000;
  return meta() ? Math.min(byLimit, backoff) : backoff;
}

export const mayUpdate = () => Date.now() >= nextUpdateAt();

/** Calls `fn` after each update that computed new data. */
export function onComputed(fn: (meta: Meta) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Loads what was kept, then updates when it is due; again whenever the app comes back to the front. */
export function startEngine(): Promise<void> {
  if (started) return started;
  started = (async () => {
    // What the app kept when it signed in to a server: no longer used.
    for (const key of ["market.token", "market.server"]) await Storage.removeItem(key).catch(() => {});
    const stored = await Storage.getItem(LAST_FETCH).catch(() => null);
    lastFetch.set(stored ? Number(stored) : null);
    const kept = await readJson<Meta>("market/meta.json");
    if (kept) {
      meta.set(kept);
      version.update((v) => v + 1);
    }
  })();
  started.then(() => {
    // Coming back to the front is using the app: an update is due if the hour has passed. Made once, outside any
    // component, so it lives as long as the app; it follows only `lifecycle`.
    effect(() => {
      if (lifecycle() === "active") untracked(() => ensureFresh());
    });
  });
  return started;
}

/** Starts an update when one is due (none running, the hour passed); resolves when it ends. */
export function ensureFresh(): Promise<void> {
  if (running) return running;
  if (!mayUpdate()) return Promise.resolve();
  return update();
}

/**
 * The Refresh button. Within the hour it fetches nothing ("fresh": the market is as new as poe.ninja's hourly pages
 * would make it); after a failure it tries again at once, since the hour's market never came.
 */
export async function updateNow(): Promise<"updated" | "fresh" | "failed"> {
  await started;
  if (!running) {
    if (!failures && !mayUpdate()) return "fresh";
    update();
  }
  await running;
  return failure() ? "failed" : "updated";
}

/** Resolves once there is a market to show: the one kept, or the first update's; throws when that failed. */
export async function ready(): Promise<Meta> {
  await started;
  if (!meta()) await (running ?? ensureFresh());
  const m = meta();
  if (!m) throw lastError ?? new Error("No market yet");
  return m;
}

function update(): Promise<void> {
  running = run().finally(() => {
    running = null;
    updating.set(false);
    progress.set(null);
  });
  return running;
}

async function run(): Promise<void> {
  updating.set(true);
  failure.set(null);
  offline.set(false);
  const now = Date.now();
  lastFetch.set(now);
  await Storage.setItem(LAST_FETCH, String(now)).catch(() => {});
  try {
    await fetchAndCompute(false);
    failures = 0;
    lastError = null;
  } catch (e) {
    // Offline with no market made yet: make it from the pages kept, if they are all here.
    if (isOffline(e) && !meta()) await fetchAndCompute(true).catch(() => {});
    failures++;
    lastFailure = Date.now();
    lastError = e as Error;
    offline.set(isOffline(e));
    failure.set(errorText(e));
    console.error("update", (e as Error).message);
  }
}

/** Each page's prices, kept while the app runs by when its text last changed: an unchanged page is not read again. */
const parsedPages = new Map<string, { changedAt: number; prices: ReturnType<typeof parsePage> }>();

async function pricesOf(source: Source, page: Page): Promise<ReturnType<typeof parsePage>> {
  const hit = parsedPages.get(page.url);
  if (hit && hit.changedAt === page.head.changedAt) return hit.prices;
  const body = await page.json();
  await tick();
  let prices: ReturnType<typeof parsePage> = [];
  // A trade-site page is thousands of lines (the bases', 18 000): read a chunk of them at a time.
  const lines = source.market === "stash" ? ((body as { lines?: unknown[] }).lines ?? []) : null;
  if (!lines) prices = parsePage(source, body);
  else
    for (let i = 0; i < lines.length; i += CHUNK) {
      prices.push(...parsePage(source, { lines: lines.slice(i, i + CHUNK) }));
      await tick();
    }
  parsedPages.set(page.url, { changedAt: page.head.changedAt, prices });
  return prices;
}

/**
 * One update: every page from the cache or poe.ninja (`offline`: from the cache only), then, unless none changed since
 * the market kept was made, the market computed again and kept.
 */
async function fetchAndCompute(offlineOnly: boolean): Promise<void> {
  const started = Date.now();
  let asked = 0;
  // The details pages are counted as the most `wantTrades` picks, and the total made exact once known.
  progress.set({ phase: "fetching", done: 0, total: 1 + sources("").length + 25 });
  const get = async (url: string) => {
    const page = await getPage(url, { freshMs: FRESH_MINUTES * 60_000, offline: offlineOnly });
    if (page.asked) asked++;
    progress.update((p) => p && { ...p, done: p.done + 1 });
    return page;
  };
  const index = await get(INDEX);
  const league = leagueOf(await index.json());
  const pages: [Source, Page][] = [];
  for (const source of sources(league)) pages.push([source, await get(source.url)]);
  const before = meta();
  if (!offlineOnly && before?.league === league && before.details && !index.changed && !pages.some(([, p]) => p.changed)) {
    progress.update((p) => p && { ...p, total: p.done + before.details!.length });
    let changed = false;
    for (const url of before.details) if ((await get(url)).changed) changed = true;
    if (!changed) {
      const next: Meta = { ...before, checkedAt: new Date().toISOString() };
      await writeJson("market/meta.json", next);
      meta.set(next);
      console.info(`update: nothing changed (${asked} pages asked) in ${Date.now() - started} ms`);
      return;
    }
  }
  const prices = [];
  for (const [source, page] of pages) prices.push(...(await pricesOf(source, page)));
  // Offline, the prices are as old as the oldest page kept.
  const at = offlineOnly ? Math.min(...pages.map(([, p]) => p.head.fetchedAt)) : Date.now();
  const snapshot = toSnapshot(league, new Date(at).toISOString(), prices);
  const wanted = wantTrades(snapshot);
  progress.update((p) => p && { ...p, total: p.done + (wanted.length ? wanted.length + 1 : 0) });
  const details: string[] = [];
  const trades = await fetchTrades(league, wanted, async (url) => {
    details.push(url);
    return (await get(url)).json();
  });
  const fetched = Date.now();
  progress.set({ phase: "computing", done: 0, total: 1 });
  await tick();
  const history = await historyBefore(league, snapshot.at.slice(0, 10));
  const previous = await swapHour(snapshot);
  const view = await buildView(snapshot, history, previous, trades);
  const next: Meta = { league, at: snapshot.at, divine: snapshot.divine, checkedAt: snapshot.at, details };
  await save(view, snapshot, trades, next);
  await recordDay(snapshot).catch((e) => console.error("history", (e as Error).message));
  meta.set(next);
  version.update((v) => v + 1);
  for (const fn of listeners) fn(next);
  console.info(
    `update: ${snapshot.prices.length} prices, ${trades.size} with days of trades, ${asked} pages asked; fetched in ${fetched - started} ms, computed in ${Date.now() - fetched} ms`,
  );
}

/** The challenge league: the first that is neither Standard nor Hardcore, nor a hardcore one (core/ninja.ts). */
function leagueOf(state: unknown): string {
  const leagues = (state as { economyLeagues: { name: string }[] }).economyLeagues;
  return leagues.find((l) => !/^(Standard|Hardcore)$|Hardcore|^HC /i.test(l.name))?.name ?? "Standard";
}

/**
 * core/market.ts `buildView`, a chunk of rows at a time: the same rows, opportunities and cycles, with a turn of
 * the event loop every 2000 rows (the 18 000 bases are most of them).
 */
async function buildView(
  snapshot: Snapshot,
  history: Map<string, History>,
  previous: Map<string, number>,
  trades: Map<string, Trades>,
): Promise<MarketView> {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const price of snapshot.prices) {
    const id = priceId(price);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(toRow(price, snapshot.divine, history.get(id), previous.get(id)));
    if (rows.length % CHUNK === 0) await tick();
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = cycles(rows, trades, snapshot.divine);
  const opportunities: Opportunity[] = [...found.slice(0, 20).map((c) => cycleOpportunity(c, byId, snapshot.divine)), ...dips(rows, trades, snapshot.divine)]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 100);
  return { league: snapshot.league, at: snapshot.at, divine: snapshot.divine, rows, opportunities, cycles: found.slice(0, 50) };
}

interface HourFile {
  at: string;
  prices: Record<string, number>;
}

/** The exchange's prices of the last update, when it was at most two hours ago (the hour's change), and keeps these. */
async function swapHour(snapshot: Snapshot): Promise<Map<string, number>> {
  const stored = await readJson<HourFile>("market/hour.json");
  const prices: Record<string, number> = {};
  for (const p of snapshot.prices) if (p.kind === "currency" || p.kind === "card") prices[priceId(p)] = p.chaos;
  await writeJson("market/hour.json", { at: snapshot.at, prices } satisfies HourFile);
  const fresh = stored && Date.parse(snapshot.at) - Date.parse(stored.at) <= 2 * 3_600_000;
  return new Map(fresh ? Object.entries(stored.prices) : []);
}

async function save(view: MarketView, snapshot: Snapshot, trades: Map<string, Trades>, meta: Meta) {
  const head = { league: view.league, at: view.at, divine: view.divine };
  const next: typeof memory = {
    summary: summarize(view),
    opportunities: { ...head, opportunities: view.opportunities, cycles: view.cycles },
    rows: new Map(KINDS.map((kind) => [kind, { ...head, kind, rows: rowsFor(view, kind) }])),
    filter: filterInput(snapshot),
    trades: Object.fromEntries([...trades].map(([id, t]) => [id, t.days])),
  };
  await writeJson("market/summary.json", next.summary);
  await writeJson("market/opportunities.json", next.opportunities);
  for (const [kind, file] of next.rows) await writeJson(`market/rows-${kind}.json`, file);
  await writeJson("market/filter-input.json", next.filter);
  await writeJson("market/trades.json", next.trades);
  await writeJson("market/meta.json", meta);
  memory = next;
}

async function kept<T>(read: () => T | undefined, name: string, keep: (value: T) => void): Promise<T> {
  await ready();
  const hit = read();
  if (hit !== undefined) return hit;
  const value = await readJson<T>(name);
  if (value === null) throw new Error(`${name} is missing: update again`);
  keep(value);
  return value;
}

export const summary = () => kept(() => memory.summary, "market/summary.json", (v: Summary) => (memory.summary = v));

export const opportunities = () =>
  kept(() => memory.opportunities, "market/opportunities.json", (v: OpportunitiesFile) => (memory.opportunities = v));

export const rows = (kind: Kind) => kept(() => memory.rows.get(kind), `market/rows-${kind}.json`, (v: RowsFile) => memory.rows.set(kind, v));

/** What the loot filter is made from (core/filter.ts `filterInput`). */
export const filterSource = () => kept(() => memory.filter, "market/filter-input.json", (v: FilterInput) => (memory.filter = v));

const trades = () => kept(() => memory.trades, "market/trades.json", (v: Record<string, TradeDay[]>) => (memory.trades = v));

/** The kind a row id is of, from its poe.ninja page. */
const KIND_OF = new Map(sources("").map((s) => [s.page, s.kind]));

/**
 * One item: its row, its days (the local history once it holds three; before that, the details page's days for an
 * exchange item that has them), the cheap and dear zones, a forecast and, given `compare`, another league's days
 * kept here, aligned by the day of the league.
 */
export async function itemDetail(id: string, compare?: string): Promise<ItemDetail> {
  const kind = KIND_OF.get(id.split(":")[0]);
  if (!kind) throw new Error(`No such item: ${id}`);
  const file = await rows(kind);
  const row = file.rows.find((r) => r.id === id);
  if (!row) throw new Error(`No such item: ${id}`);
  const today = file.at.slice(0, 10);
  const own = (await pointsOf(file.league, id)).filter((p) => p[0] !== today);
  let points: [string, number, number][] = [...own, [today, row.chaos, row.depth]];
  let source: ItemDetail["source"] = "local";
  if (points.length < 3) {
    const days = (await trades())[id];
    if (days && days.length >= 3) {
      points = days.filter((d) => d.day !== today).map((d) => [d.day, d.chaos, d.volume] as [string, number, number]);
      points.push([today, row.chaos, row.depth]);
      source = "ninja";
    }
  }
  const kept = await leagues();
  const current = kept.find((l) => l.league === file.league);
  const since = current ? Date.parse(current.start) : undefined;
  const dayOf = (day: string, start: number) => Math.round((Date.parse(day) - start) / 86_400_000);
  const other = compare ? kept.find((l) => l.league === compare && l.league !== file.league) : undefined;
  const season = other
    ? { league: other.league, points: (await pointsOf(other.league, id)).map(([day, chaos]) => ({ day: dayOf(day, Date.parse(other.start)), chaos })) }
    : undefined;
  const prices = points.map((p) => p[1]);
  return {
    league: file.league,
    at: file.at,
    divine: file.divine,
    row,
    history: points.map(([day, chaos, depth]) => ({ day, chaos, depth, leagueDay: since === undefined ? undefined : dayOf(day, since) })),
    source,
    zones: zones(prices),
    forecast: forecast(prices.length >= 4 ? prices : (sparkPrices(row.chaos, row.spark) ?? [])) ?? null,
    seasons: kept.filter((l) => l.league !== file.league).map((l) => l.league),
    season,
  };
}

/** Where the data is kept: a folder, or null when it is in the app's storage. */
export const dataLocation = dataFolder;

/** Where the cache is kept: a folder, or null when it is in the app's storage. */
export const cacheLocation = () => (dataFolder() ? pathOf(CACHE) : null);

/** How many bytes the cache takes: poe.ninja's pages and the item pictures. */
export const cacheSize = () => sizeOf(CACHE);

/**
 * Forgets poe.ninja's pages and the item pictures kept. The market made from them stays; the next update asks
 * poe.ninja for every page again (when it is due).
 */
export async function clearCache(): Promise<void> {
  await removeAll(CACHE);
  parsedPages.clear();
  clearArt();
  version.update((v) => v + 1);
}

/** Forgets the market and the history kept here. The hour's limit stays: the next update fetches when it is due. */
export async function clearData(): Promise<void> {
  await removeAll("market");
  await removeAll("history");
  memory = { rows: new Map() };
  meta.set(null);
  version.update((v) => v + 1);
}
