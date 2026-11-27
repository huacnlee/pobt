// Where the app keeps what it computed: files in its own data directory (`process.dataDir`, which NSH chooses). A
// host with no data directory (the headless tests) keeps the same files in Storage under `market.file:<path>`, so
// everything above this works the same; Storage holds 5 MB, so a file over BIG stays in memory there, for as long as
// the app runs (a real market's raw pages are 12 MB).
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "fs/promises";
import { Storage } from "nsh";
import { gunzip, gzip } from "zlib";

const PREFIX = "market.file:";
/** Without a data folder, files larger than this (characters) are kept in memory, not in Storage. */
const BIG = 512 * 1024;
const inMemory = new Map<string, string>();

/** The folder the app keeps its data in, or null when it lives in Storage. */
export function dataFolder(): string | null {
  return process.dataDir ?? null;
}

/** A file's full path, when the app has a data folder. */
export const pathOf = (name: string) => `${process.dataDir}/${name}`;
const parentOf = (name: string) => name.split("/").slice(0, -1).join("/");

export async function readText(name: string): Promise<string | null> {
  if (!dataFolder()) return inMemory.get(name) ?? Storage.getItem(PREFIX + name);
  return readFile(pathOf(name), "utf8").catch(() => null);
}

export async function readJson<T>(name: string): Promise<T | null> {
  const text = await readText(name);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Writes a file whole: into a temporary file first, then over the old one, so a crash never leaves half of one. */
export async function writeText(name: string, text: string): Promise<void> {
  if (!dataFolder()) {
    if (text.length > BIG) {
      inMemory.set(name, text);
      await Storage.removeItem(PREFIX + name);
    } else {
      inMemory.delete(name);
      await Storage.setItem(PREFIX + name, text);
    }
    return;
  }
  await writeFileWhole(name, text);
}

/** Writes bytes (a picture) to a file whole. Only with a data folder: Storage keeps text. */
export async function writeBytes(name: string, bytes: Uint8Array): Promise<void> {
  if (dataFolder()) await writeFileWhole(name, bytes);
}

async function writeFileWhole(name: string, data: string | Uint8Array): Promise<void> {
  const parent = parentOf(name);
  if (parent) await mkdir(pathOf(parent), { recursive: true });
  const tmp = `${pathOf(name)}.tmp`;
  await writeFile(tmp, data);
  // Windows does not rename over a file: the old one goes first there.
  await rename(tmp, pathOf(name)).catch(async () => {
    await unlink(pathOf(name)).catch(() => {});
    await rename(tmp, pathOf(name));
  });
}

export const writeJson = (name: string, value: unknown) => writeText(name, JSON.stringify(value));

/** The names in a folder (files and folders, not recursive), sorted. */
export async function list(folder: string): Promise<string[]> {
  if (!dataFolder()) {
    const start = `${PREFIX}${folder}/`;
    const names = new Set<string>();
    for (const key of [...(await Storage.keys()), ...[...inMemory.keys()].map((n) => PREFIX + n)])
      if (key.startsWith(start)) names.add(key.slice(start.length).split("/")[0]);
    return [...names].sort();
  }
  return (await readdir(pathOf(folder)).catch(() => [] as string[])).sort();
}

export async function remove(name: string): Promise<void> {
  if (!dataFolder()) {
    inMemory.delete(name);
    await Storage.removeItem(PREFIX + name);
  } else await unlink(pathOf(name)).catch(() => {});
}

/** Removes a folder and everything in it. */
export async function removeAll(folder: string): Promise<void> {
  if (!dataFolder()) {
    for (const key of await Storage.keys()) if (key.startsWith(`${PREFIX}${folder}/`)) await Storage.removeItem(key);
    for (const name of [...inMemory.keys()]) if (name.startsWith(`${folder}/`)) inMemory.delete(name);
    return;
  }
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory()) await walk(`${dir}/${e.name}`);
      else await unlink(`${dir}/${e.name}`).catch(() => {});
    }
    await rmdir(dir).catch(() => {});
  };
  await walk(pathOf(folder));
}

/** Whether a file is there. */
export async function exists(name: string): Promise<boolean> {
  if (!dataFolder()) return inMemory.has(name) || (await Storage.getItem(PREFIX + name)) !== null;
  return stat(pathOf(name)).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** How many bytes a folder's files take, everything in it counted (in Storage: the characters kept). */
export async function sizeOf(folder: string): Promise<number> {
  if (!dataFolder()) {
    let total = 0;
    for (const key of await Storage.keys())
      if (key.startsWith(`${PREFIX}${folder}/`)) total += (await Storage.getItem(key))?.length ?? 0;
    for (const [name, text] of inMemory) if (name.startsWith(`${folder}/`)) total += text.length;
    return total;
  }
  const walk = async (dir: string): Promise<number> => {
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = `${dir}/${e.name}`;
      if (e.isDirectory()) total += await walk(path);
      else total += await stat(path).then((s) => s.size, () => 0);
    }
    return total;
  };
  return walk(pathOf(folder));
}

const zip = (text: string) =>
  new Promise<Uint8Array>((resolve, reject) => gzip(text, (error, out) => (error ? reject(error) : resolve(new Uint8Array(out)))));
const unzip = (bytes: Uint8Array) =>
  new Promise<string>((resolve, reject) => gunzip(bytes, (error, out) => (error ? reject(error) : resolve(out.toString("utf8")))));

/**
 * Writes text gzipped (`<name>.gz`): what poe.ninja sends is JSON, a tenth of its size gzipped, and one write of a
 * file holds at most 8 MiB (the bases' page is 9 MB). Without a data folder, as text.
 */
export async function writePacked(name: string, text: string): Promise<void> {
  if (!dataFolder()) return writeText(name, text);
  await writeFileWhole(`${name}.gz`, await zip(text));
}

export async function readPacked(name: string): Promise<string | null> {
  if (!dataFolder()) return readText(name);
  const bytes = await readFile(pathOf(`${name}.gz`)).catch(() => null);
  return bytes ? unzip(bytes).catch(() => null) : null;
}
