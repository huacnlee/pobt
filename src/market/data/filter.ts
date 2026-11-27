// The loot filter: which one, made here from the market's prices (core/filter.ts), and putting it where the game
// reads it. One press writes it into the game's filter folder; from then on, each time an update computes new prices,
// it is written again (the game reloads it from its options).
import { mkdir, readdir, writeFile } from "fs/promises";
import { platform } from "nsh";
import { homedir } from "os";
import { join } from "path";
import { type CustomSounds, generateFilter, MIN_WORTH, type Stage as ServerStage } from "../core/filter";
import { engine, filterSource, onComputed, startEngine } from "./engine";
import { settings } from "./local";
import { persisted } from "./persisted";

/** The game's stage, which decides what is worth picking up (core/filter.ts). */
export type Stage = ServerStage;

export const STAGES: { value: Stage; minWorth: number }[] = (Object.keys(MIN_WORTH) as Stage[]).map((value) => ({ value, minWorth: MIN_WORTH[value] }));

export type FilterChoice = { stage: Stage } | { minWorth: number };

/** The player's sound files by tier, when the settings ask for their own sounds; none for the game's. */
export function customSounds(): [string, string, string] | undefined {
  const s = settings();
  if (s.filterSound !== "custom" || !s.filterSounds?.some(Boolean)) return undefined;
  return s.filterSounds;
}

/** Sound files the player has in the game's filter folder and the folders in it, as paths from there. */
export async function soundFiles(): Promise<string[]> {
  const root = await filterFolder();
  const out: string[] = [];
  const sep = platform.os === "windows" ? "\\" : "/";
  const walk = async (dir: string, rel: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const path = rel ? `${rel}${sep}${e.name}` : e.name;
      if (e.isDirectory() && depth < 2) await walk(join(dir, e.name), path, depth + 1);
      else if (/\.(mp3|wav|ogg)$/i.test(e.name)) out.push(path);
    }
  };
  await walk(root, "", 0);
  return out.sort((a, b) => a.localeCompare(b)).slice(0, 2000);
}

export function fileName(choice: FilterChoice): string {
  return "stage" in choice ? `POBT-${choice.stage}.filter` : `POBT-${choice.minWorth}c.filter`;
}

/** What is installed, to keep it current: the choice, where, and the prices it was made from. */
export interface Installed {
  choice: FilterChoice;
  path: string;
  at?: string;
}
export const installed = persisted<Installed | null>("market.filter", null);

/** Where the game reads filters on this platform, unless the settings name another folder. */
export async function filterFolder(): Promise<string> {
  if (settings().filterFolder) return settings().filterFolder;
  const home = homedir();
  if (platform.os === "windows") return join(home, "Documents", "My Games", "Path of Exile");
  return join(home, "Library", "Application Support", "Path of Exile");
}

/** The filter's text for a choice, with the player's sounds, from the market's prices. */
export async function filterText(choice: FilterChoice): Promise<string> {
  const input = await filterSource();
  const sounds = customSounds() as CustomSounds | undefined;
  if ("stage" in choice) return generateFilter(input, { stage: choice.stage, sounds });
  // A threshold of its own follows the stage it falls in (the last whose threshold it reaches), for what to hide.
  const stage = STAGES.filter((s) => choice.minWorth >= s.minWorth).pop()?.value ?? "campaign";
  return generateFilter(input, { stage, minWorth: choice.minWorth, sounds });
}

/** How many rules each stage's filter has, for the page. */
export async function ruleCounts(): Promise<Map<Stage, number>> {
  const input = await filterSource();
  return new Map(STAGES.map((s) => [s.value, generateFilter(input, { stage: s.value }).split("\n\n").length - 1]));
}

/** Writes the filter into the game's folder and remembers it, to keep it current; returns the file's path. */
export async function installFilter(choice: FilterChoice): Promise<string> {
  const text = await filterText(choice);
  const folder = await filterFolder();
  await mkdir(folder, { recursive: true });
  const file = join(folder, fileName(choice));
  await writeFile(file, text);
  installed.set({ choice, path: file, at: (await filterSource()).at });
  return file;
}

/** Installs the filter again when the market's prices are newer than the ones installed (with the sounds the
 * settings ask for now); returns the path when it did. */
export async function updateInstalled(): Promise<string | undefined> {
  await installed.ready;
  const current = installed();
  const at = engine.meta()?.at;
  if (!current || !at || at === current.at) return undefined;
  return installFilter(current.choice);
}

/** Keeps the installed filter current: now, and after each update; `onUpdated` hears of each rewrite. */
export function startFilterUpdates(onUpdated: (path: string) => void) {
  const check = () =>
    updateInstalled()
      .then((path) => path && onUpdated(path))
      .catch(() => {});
  onComputed(check);
  // The market kept may be newer than the filter installed (an update that ran while the filter was off).
  startEngine().then(check);
}
