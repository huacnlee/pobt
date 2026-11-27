// Item pictures from the game's CDN (web.poecdn.com), kept on disk. NSH's Image caches what it downloads in memory
// only, so each start would download every picture again: here each is downloaded once into the cache folder
// (`cache/art/<hash>.<ext>`) and shown from there afterwards. A few at a time, so a long list does not open dozens of
// connections at once. With no data folder (the headless tests), the picture is shown from its URL.
import { AGENT } from "./ninja";
import { CACHE } from "./cache";
import { dataFolder, exists, pathOf, remove, writeBytes } from "./store";

export const CDN = "https://web.poecdn.com/";
const PARALLEL = 4;

/** What each picture is shown from, once known: its file, or its URL when it could not be kept. */
const known = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];

/** A short, stable name for a picture's path: two 32-bit FNV-1a hashes. */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 0x200) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await work();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function keep(icon: string): Promise<string> {
  const url = artUrl(icon);
  if (!dataFolder()) return url;
  const ext = icon.match(/\.(png|jpe?g|webp|gif)$/i)?.[0] ?? ".png";
  const name = `${CACHE}/art/${hash(icon)}${ext}`;
  if (await exists(name)) return pathOf(name);
  try {
    const response = await slot(() => fetch(url, { headers: { "user-agent": AGENT } }));
    if (!response.ok) return url;
    await writeBytes(name, new Uint8Array(await response.arrayBuffer()));
    return pathOf(name);
  } catch {
    return url;
  }
}

/** Where to show a picture from (its path on the CDN, as poe.ninja gives it): its file once kept. */
export function artSource(icon: string): Promise<string> {
  let hit = known.get(icon);
  if (!hit) {
    hit = keep(icon);
    known.set(icon, hit);
  }
  return hit;
}

/** The picture's URL on the CDN. */
export const artUrl = (icon: string) => CDN + icon.replace(/^\//, "");

/** A kept file that does not show (cut short, not a picture): removed, and the picture shown from its URL. */
export function dropArt(icon: string): string {
  const url = artUrl(icon);
  known.set(icon, Promise.resolve(url));
  void remove(`${CACHE}/art/${hash(icon)}${icon.match(/\.(png|jpe?g|webp|gif)$/i)?.[0] ?? ".png"}`);
  return url;
}

/** Forgets which pictures are kept (after the cache is cleared). */
export function clearArt() {
  known.clear();
}
