// The build open in POBT's build editor, held by the official Path of Building running with no window
// (ext/pobt-native/src/host/service.rs). Every number and list comes from POB itself, and every change goes through
// POB's own controls, so the editor follows each POB update with nothing here to change.
import { batch, signal } from "nsh";
import { Pob } from "pobt/native";

export type Game = "poe1" | "poe2";

export class PobError extends Error {}

/** Runs operation `op` of POB's service (service.lua, service/<page>.lua) and returns its answer. */
export async function pob<T = unknown>(op: string, args: unknown = {}): Promise<T> {
  const answer = JSON.parse(await Pob.serviceRequest(op, JSON.stringify(args))) as { ok?: T; err?: string };
  if (answer.err !== undefined) {
    // What the user reads is POB's message; where it came from (the Lua traceback) goes to the log.
    console.error(`POB ${op}: ${answer.err}`);
    const first = answer.err.split("\n")[0].replace(/^(Error: )?[\w/.-]+\.lua:\d+: /, "");
    throw new PobError(first);
  }
  return answer.ok as T;
}

/** A POB control as service.lua reads it. */
export type Control = {
  shown: boolean;
  enabled: boolean;
  label?: string;
  kind: "list" | "edit" | "check" | "other";
  sel?: number;
  items?: string[];
  text?: string;
  placeholder?: string;
  checked?: boolean;
};

export type Summary = {
  name: string;
  /** The file it is saved to, null for one never saved. */
  path: string | null;
  className: string;
  ascendClassName: string;
  level: number;
  pointsUsed: number;
  /** POB's points line as it draws it, in its colour codes ("^7118 / 123   ^78 / 8"), and its explanation. */
  points: string;
  pointsReq: string;
  ascUsed: number;
  unsaved: boolean;
  revision: number;
};

/** A build or a folder in POB's builds folder, as its build list shows it. */
export type BuildEntry = {
  folder?: string;
  name?: string;
  subPath: string;
  path: string;
  modified?: number;
  level?: number;
  className?: string;
  ascendClassName?: string;
};

export type BuildFolder = { buildPath: string; subPath: string; sort: string; list: BuildEntry[] };

export type SortMode = "NAME" | "CLASS" | "EDITED" | "LEVEL";

/** POB's builds folder `subPath` ("" for the top), or the builds matching `filter` in every folder. */
export function listBuilds(subPath: string, filter: string, sort?: SortMode): Promise<BuildFolder> {
  return pob<BuildFolder>("builds", { subPath, filter, sort });
}

/** Opens a build file of POB's builds folder; saving writes it back. */
export async function openFile(entry: BuildEntry): Promise<void> {
  await run(() => pob("openFile", { path: entry.path, name: entry.name }), entry.name);
}

/** A new, empty build, as POB's New makes it. */
export async function newBuild(): Promise<void> {
  await run(() => pob("new"));
}

export type SaveResult = { path?: string; exists?: string; needsName?: boolean };

/** Saves the open build to its file, or (`name` given) as `name` in the builds folder `subPath`. */
export async function saveBuild(as?: { name: string; subPath?: string; overwrite?: boolean }): Promise<SaveResult> {
  const r = await pob<SaveResult>("save", as ?? {});
  await reload();
  return r;
}

async function run(open: () => Promise<unknown>, name?: string): Promise<void> {
  batch(() => {
    build.busy.set(true);
    build.loading.set(name ?? "");
    build.open.set(false);
    build.error.set("");
  });
  try {
    await open();
    build.open.set(true);
    await reload();
  } finally {
    batch(() => {
      build.busy.set(false);
      build.loading.set(null);
    });
  }
}

export type SidebarLine = { left?: string; right?: string; center?: boolean };

export type SidebarData = {
  summary: Summary;
  mainSocketGroup?: Control;
  mainSkill?: Control;
  mainSkillPart?: Control;
  mainSkillStageCount?: Control;
  mainSkillMineCount?: Control;
  mainSkillMinion?: Control;
  mainSkillMinionSkill?: Control;
  lines: SidebarLine[];
  warnings: string[];
};

/** The Path of Building behind the editor: it loads once per run. */
export const service = {
  state: signal<"idle" | "loading" | "ready" | "failed">("idle"),
  error: signal(""),
  version: signal(""),
  /** The game whose Path of Building runs: one per run of POBT (POB works from its own folder). */
  game: signal<Game | null>(null),
};

export const build = {
  /** Whether a build is open. */
  open: signal(false),
  /** POB's calculation count: it changes after every recalculation, so what reads it reloads. */
  revision: signal(0),
  sidebar: signal<SidebarData | null>(null),
  busy: signal(false),
  error: signal(""),
  /** The build being opened (its name), from the moment it is asked for until POB has it: the editor shows it at
   * once, loading, instead of waiting on the list. */
  loading: signal<string | null>(null),
};

/** Starts the Path of Building of `game` with no window; resolves once it is ready or failed. */
export async function startService(game: Game): Promise<void> {
  // The other game's Path of Building runs: it can only change with POBT started again (BuildEditor says so).
  if (service.game() && service.game() !== game) return;
  if (service.state() === "ready" || service.state() === "loading") return;
  service.game.set(game);
  service.state.set("loading");
  const why = Pob.serviceStart(game);
  if (why) {
    batch(() => {
      service.error.set(why);
      service.state.set("failed");
    });
    return;
  }
  await new Promise<void>((resolve) => {
    const poll = () => {
      const s = JSON.parse(Pob.serviceStatus()) as { state: string; error: string; version: string };
      if (s.state === "loading") return void setTimeout(poll, 100);
      batch(() => {
        service.version.set(s.version);
        service.error.set(s.error);
        service.state.set(s.state === "ready" ? "ready" : "failed");
      });
      resolve();
    };
    poll();
  });
}

/** What the user pasted, as POB opens it: the XML, or a build code (a link is fetched first, by POB's site list). */
async function source(input: string): Promise<{ xml?: string; code?: string }> {
  const text = input.trim();
  if (text.startsWith("<")) return { xml: text };
  if (/^https?:\/\//i.test(text)) {
    const url = await pob<string | null>("link", { url: text });
    if (!url) throw new PobError("Path of Building does not know this site");
    const res = await fetch(url);
    if (!res.ok) throw new PobError(`HTTP ${res.status}`);
    const body = (await res.text()).trim();
    return body.startsWith("<") ? { xml: body } : { code: body };
  }
  return { code: text };
}

/** Opens a pasted build in place of the one open. */
export async function openBuild(input: string, name?: string): Promise<void> {
  await run(async () => pob("open", { ...(await source(input)), name }), name);
}

/** The build code of the open build. */
export async function exportCode(): Promise<string> {
  return (await pob<{ code: string }>("export")).code;
}

/** Reads the sidebar again and tells every page POB recalculated. */
export async function reload(): Promise<void> {
  try {
    const sidebar = await pob<SidebarData>("sidebar");
    batch(() => {
      build.sidebar.set(sidebar);
      build.revision.set(sidebar.summary.revision);
      build.error.set("");
    });
  } catch (e) {
    build.error.set(String((e as Error).message ?? e));
  }
}

/** Acts on a POB control as the user would (a list's 1-based index, an edit box's text, a check box's state), then
 * reloads. `path` leads from the build to the control: `["controls", "mainSocketGroup"]`. */
export async function act(path: (string | number)[], value: number | string | boolean): Promise<void> {
  build.busy.set(true);
  try {
    await pob("act", { path, value });
    await reload();
  } catch (e) {
    build.error.set(String((e as Error).message ?? e));
  } finally {
    build.busy.set(false);
  }
}

/** Runs a page's operation that changes the build (`"skills.setGemLevel"`), then reloads. */
export async function change(op: string, args: unknown = {}): Promise<void> {
  build.busy.set(true);
  try {
    await pob(op, args);
    await pob("settle");
    await reload();
  } catch (e) {
    build.error.set(String((e as Error).message ?? e));
  } finally {
    build.busy.set(false);
  }
}
