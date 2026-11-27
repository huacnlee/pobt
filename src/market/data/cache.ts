// poe.ninja's answers, kept on disk as they came, gzipped: one file per page (`cache/ninja/…/<page>.json.gz`) and beside it a small
// head (`.head.json`) with when it was fetched and the validators poe.ninja sent (ETag, Last-Modified). A page fetched
// less than FRESH_MINUTES ago is read from here without asking; an older one is asked for again conditionally, and a
// 304 ("not modified") or the same text again counts as unchanged, so the engine can skip computing what did not
// change. Offline, the kept copy is used whatever its age.
import { type Answer, request } from "./ninja";
import { readJson, readPacked, writeJson, writePacked } from "./store";

/** The folder the cache is in (the raw pages, and the item pictures, art.ts). */
export const CACHE = "cache";

/**
 * A page this young is used as kept, never asked for. Less than the hour between updates, so a page fetched by the last
 * update is asked again by the next one; a retry after a failed update reuses what that one got.
 */
export const FRESH_MINUTES = 50;

export interface Head {
  url: string;
  /** When poe.ninja was last asked, or answered from here offline (ms). */
  fetchedAt: number;
  /** When the text last changed (ms): what a parse of it is kept by. */
  changedAt: number;
  etag?: string;
  lastModified?: string;
}

/** A page from the cache or poe.ninja: whether it changed since the copy kept, and its JSON, read only when asked. */
export interface Page {
  url: string;
  changed: boolean;
  /** Whether poe.ninja was asked for it. */
  asked: boolean;
  /** Whether it is a copy kept, used because poe.ninja could not be reached. */
  stale: boolean;
  head: Head;
  json(): Promise<unknown>;
}

/** Where a poe.ninja URL is kept: by league, then the page (`exchange-Currency`), a details page by its type and id. */
export function cacheName(url: string): string {
  const u = new URL(url);
  const q = (name: string) => encodeURIComponent(u.searchParams.get(name) ?? "");
  const path = u.pathname.replace(/^\/poe1\/api\//, "");
  if (path.endsWith("/details")) return `${CACHE}/ninja/${q("league")}/details/${q("type")}/${q("id")}`;
  if (path.includes("/exchange/")) return `${CACHE}/ninja/${q("league")}/exchange-${q("type")}`;
  if (path.includes("/stash/")) return `${CACHE}/ninja/${q("league")}/stash-${q("type")}`;
  return `${CACHE}/ninja/${path.replace(/\//g, "-")}`;
}

const parsed = (text: string) => () => Promise.resolve(JSON.parse(text) as unknown);

/**
 * One page. Kept and younger than `freshMs`: from here, nothing asked. Otherwise poe.ninja is asked (conditionally
 * when a copy is kept); with `offline`, a copy kept of any age is used without asking.
 */
export async function getPage(url: string, options: { freshMs: number; offline?: boolean; now?: number }): Promise<Page> {
  const name = cacheName(url);
  const now = options.now ?? Date.now();
  const head = await readJson<Head>(`${name}.head.json`);
  const keptText = () => readPacked(`${name}.json`);
  if (head && (options.offline || now - head.fetchedAt < options.freshMs)) {
    const text = await keptText();
    if (text !== null) return { url, changed: false, asked: false, stale: !!options.offline, head, json: parsed(text) };
  }
  if (options.offline) throw new Error(`${url} is not kept`);
  const old = head ? await keptText() : null;
  const answer: Answer = await request(url, old !== null ? { etag: head?.etag, lastModified: head?.lastModified } : {});
  const unchanged = old !== null && (answer.status === 304 || answer.text === old);
  const text = unchanged ? old! : answer.text;
  const next: Head = {
    url,
    fetchedAt: now,
    changedAt: unchanged && head ? head.changedAt : now,
    etag: answer.etag,
    lastModified: answer.lastModified,
  };
  if (!unchanged) await writePacked(`${name}.json`, text);
  await writeJson(`${name}.head.json`, next);
  return { url, changed: !unchanged, asked: true, stale: false, head: next, json: parsed(text) };
}
