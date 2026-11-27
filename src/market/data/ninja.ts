// poe.ninja, asked politely: the app's only source. Its API runs poe.ninja's own site and is not a product, so the app
// says who it is (a User-Agent naming POBT and its version), asks one page at a time, waits and tries again
// when it is told to slow down (429, Retry-After) or the site has a hiccup (5xx), and asks for the market at most once
// an hour (engine.ts). What it answers is kept as it came (cache.ts) and asked again conditionally.
import { shellInfo } from "nsh/updater";
import { USER_AGENT } from "../core/ninja";
import { t } from "./i18n";

/** The User-Agent every request carries: POBT, its version (`dev` unpackaged), and that it is the desktop app. */
export const AGENT = `${USER_AGENT}/${shellInfo().version ?? "dev"} (desktop app)`;

export class NinjaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TRIES = 4;
/** How often a request with no answer (no connection) is tried. */
const OFFLINE_TRIES = 2;
/** The longest a Retry-After is honored for before giving up on this update. */
const MAX_WAIT_MS = 120_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How long the site asked to wait (seconds or a date), else the backoff for try `n`: 2 s, 4 s, 8 s. */
function waitFor(response: Response | null, n: number): number {
  const after = response?.headers.get("retry-after");
  if (after) {
    const seconds = Number(after);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now();
    if (ms > 0) return Math.min(ms, MAX_WAIT_MS);
  }
  return 2000 * 2 ** n;
}

/** What poe.ninja sent for a page: its text, or that it has not changed since the copy kept (304). */
export interface Answer {
  status: 200 | 304;
  text: string;
  etag?: string;
  lastModified?: string;
}

/** The validators of the copy kept, sent so poe.ninja can answer "not modified" (304) instead of the page again. */
export interface Validators {
  etag?: string;
  lastModified?: string;
}

/**
 * One page, tried again on 429 and 5xx and on a dropped connection; other errors fail at once. With `kept`, asks
 * conditionally (If-None-Match, If-Modified-Since), and a 304 comes back as such, with no text.
 */
export async function request(url: string, kept: Validators = {}): Promise<Answer> {
  const headers: Record<string, string> = { "user-agent": AGENT, accept: "application/json" };
  if (kept.etag) headers["if-none-match"] = kept.etag;
  if (kept.lastModified) headers["if-modified-since"] = kept.lastModified;
  let last: Error = new NinjaError(0, url);
  for (let n = 0; n < TRIES; n++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, { headers });
    } catch (e) {
      last = new NinjaError(0, (e as Error).message);
    }
    if (response && (response.ok || response.status === 304)) {
      const etag = response.headers.get("etag") ?? undefined;
      const lastModified = response.headers.get("last-modified") ?? undefined;
      if (response.status === 304) return { status: 304, text: "", etag: etag ?? kept.etag, lastModified: lastModified ?? kept.lastModified };
      return { status: 200, text: await response.text(), etag, lastModified };
    }
    if (response) {
      last = new NinjaError(response.status, `poe.ninja: HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw last;
    }
    // No answer at all is most often no network: tried once more, then the market kept is shown as offline.
    if (!response && n >= OFFLINE_TRIES - 1) break;
    if (n < TRIES - 1) await sleep(waitFor(response, n));
  }
  throw last;
}

/** Whether an error is the network's (no connection, poe.ninja unreachable) rather than an answer's. */
export const isOffline = (e: unknown) => e instanceof NinjaError && e.status === 0;

/** An error as the app says it: poe.ninja's failures in words, anything else as it came. */
export function errorText(e: unknown): string {
  if (e instanceof NinjaError) {
    if (e.status === 0) return t("error.network");
    if (e.status === 429) return t("error.busy");
    return t("error.server", { status: e.status });
  }
  return e instanceof Error ? e.message : String(e);
}
