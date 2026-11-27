// The editor's first screen: the builds Path of Building keeps, in its own builds folder and as its build list shows
// them (Modules/BuildListHelpers.lua: folders first, POB's sort and search). Opening one and saving writes the same
// file, so Path of Building and POBT share every build.
import { type ContextMenuEvent, effect, resource, signal, untracked, View } from "nsh";
import { Tree, type TreeEntry, type TreeItem } from "nsh/base";
import { Menu } from "nsh/desktop";
import { Button, Empty, Icon, Modal, Select, Text, Input } from "../ui";
import { BODY, BrassButton, C, DISPLAY, Gate, GoldRule, Plaque, Subtitle, textIn, Title } from "../ui/launcher";
import { WASH } from "../ui/motion";
import { t, tr } from "./i18n";
import { build, type BuildEntry, deleteEntry, listBuilds, newBuild, newFolder, openFile, renameEntry, type SortMode } from "./session";

/** The folders expanded and the sort: kept while the editor is open, as POB keeps them. */
const expanded = signal<string[]>([]);
const sort = signal<SortMode | undefined>(undefined);

function ago(seconds?: number): string {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A folder's id in the tree: its sub path ("Act/" for Builds/Act). */
const folderId = (e: BuildEntry) => `${e.subPath}${e.folder}/`;

function Row(props: { entry?: BuildEntry; tree: TreeEntry; onMenu?: (e: ContextMenuEvent) => void }) {
  const e = () => props.entry;
  const cls = () => {
    const a = e()?.ascendClassName;
    return tr(a && a !== "None" ? a : (e()?.className ?? ""));
  };
  return (
    <View class="h-10 flex-1 flex-row items-center gap-3 pr-4" style={{ paddingLeft: 12 + props.tree.depth * 18 }} onContextMenu={props.onMenu}>
      <View class="w-4 items-center">
        <If when={props.tree.folder} else={<View style={{ width: 5, height: 5, backgroundColor: C.trim, transform: [{ rotate: "45deg" }] }} />}>
          <View class="transition-transform duration-180 group-aria-expanded:rotate-90 motion-reduce:transition-none">
            <Icon name="chevron-right" size="sm" tone="trim" />
          </View>
        </If>
      </View>
      <Text
        class="flex-1 truncate"
        style={{
          fontFamily: props.tree.folder ? DISPLAY : BODY,
          fontSize: 14,
          fontWeight: props.tree.folder ? "700" : "400",
          letterSpacing: props.tree.folder ? 1 : 0,
          color: props.tree.folder ? C.goldHi : props.tree.disabled ? C.dim : C.text,
        }}
      >
        {props.tree.label}
      </Text>
      <If when={e() && !e()!.folder}>
        <Text class="w-40 truncate" style={{ fontFamily: BODY, fontSize: 13, color: C.gold }}>
          {cls()}
        </Text>
        <Text class="w-20 text-right" style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>
          {e()?.level ? `${t("level")} ${e()!.level}` : ""}
        </Text>
        <Text class="w-36 text-right" style={{ fontFamily: BODY, fontSize: 12, color: C.dim }}>
          {ago(e()?.modified)}
        </Text>
      </If>
    </View>
  );
}

export function BuildList(props: { onImport: () => void; onOpened: () => void }) {
  const filter = signal("");
  const typed = signal("");
  const error = signal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const search = (v: string) => {
    typed.set(v);
    clearTimeout(timer);
    timer = setTimeout(() => filter.set(v), 200);
  };
  // The top folder (or, while searching, POB's matches in every folder); the folders under it as they are expanded.
  const top = resource(
    () => ({ filter: filter(), sort: sort() }),
    (k) => listBuilds("", k.filter, k.sort),
  );
  const inside = signal<Record<string, BuildEntry[]>>({});
  const load = (sub: string) => {
    void listBuilds(sub, "", sort()).then(
      (f) => inside.set({ ...inside(), [sub]: f.list }),
      (err) => error.set(String((err as Error).message ?? err)),
    );
  };
  // The expanded folders are read as the list shows (again after a new sort).
  effect(() => {
    sort();
    untracked(() => {
      inside.set({});
      for (const sub of expanded()) load(sub);
    });
  });
  const entries = () => top()?.list ?? [];
  const byId = new Map<string, BuildEntry>();
  const itemsOf = (list: BuildEntry[]): TreeItem[] =>
    list.map((e) => {
      if (!e.folder) {
        byId.set(e.path, e);
        return { id: e.path, label: e.name ?? "" };
      }
      const id = folderId(e);
      byId.set(id, e);
      const kids = inside()[id];
      return {
        id,
        label: e.folder,
        // Until it is read, one muted row says it is being read (a folder needs a child to expand).
        children: kids ? (kids.length ? itemsOf(kids) : [{ id: `${id}#empty`, label: t("emptyFolder"), disabled: true }]) : [{ id: `${id}#…`, label: "…", disabled: true }],
      };
    });
  const items = () => itemsOf(entries());
  const open = (id: string) => {
    const e = byId.get(id);
    if (!e || e.folder) return;
    // The build screen shows at once (loading); POB reads the file behind it.
    error.set("");
    props.onOpened();
    void openFile(e).catch((err) =>
      build.error.set(`${t("openFailed")}: ${String((err as Error).message ?? err)}`),
    );
  };
  const sorts = () => [
    { value: "NAME", title: t("sortName") },
    { value: "CLASS", title: t("sortClass") },
    { value: "EDITED", title: t("sortEdited") },
    { value: "LEVEL", title: t("sortLevel") },
  ];
  // The toolbar's New folder makes one in the folder selected, or the selected build's, or the top.
  const selected = signal<string | null>(null);
  const target = () => {
    const e = byId.get(selected() ?? "");
    return e ? (e.folder ? folderId(e) : e.subPath) : "";
  };
  // The dialog open: a name for a new folder in `parent`, a new name for a build or a folder (or its copy), or deleting it.
  const dialog = signal<Dialog | null>(null);
  // Reads the top again and the folders open; `open` (a folder's id) is opened too.
  const refresh = (open?: string) => {
    top.refetch();
    if (open && !expanded().includes(open)) expanded.set([...expanded(), open]);
    for (const sub of expanded()) load(sub);
  };
  const named = async (name: string) => {
    const d = dialog();
    if (!d || d.kind === "delete") return;
    if (d.kind === "newFolder") {
      const sub = await newFolder(d.parent, name);
      refresh(d.parent || undefined);
      selected.set(sub);
      return;
    }
    const path = await renameEntry(d.entry, name, d.kind === "copy");
    if (d.kind === "rename" && d.entry.folder) {
      // the folder's id changes: what was open in it is open under the new one
      const was = folderId(d.entry);
      const now = `${d.entry.subPath}${name}/`;
      expanded.set(expanded().map((id) => (id.startsWith(was) ? now + id.slice(was.length) : id)));
    }
    refresh();
    selected.set(d.entry.folder ? `${d.entry.subPath}${name}/` : path);
  };
  const remove = async (e: BuildEntry) => {
    await deleteEntry(e);
    if (e.folder) expanded.set(expanded().filter((id) => !id.startsWith(folderId(e))));
    refresh();
    selected.set(null);
  };
  // The right-click menu of a build, of a folder, or (no entry) of the list's empty space: POB's build list's actions.
  const menu = (e: BuildEntry | undefined, ev: ContextMenuEvent) => {
    if (e) selected.set(e.folder ? folderId(e) : e.path);
    const newHere = { label: t("newFolder"), onSelect: () => dialog.set({ kind: "newFolder", parent: e ? (e.folder ? folderId(e) : e.subPath) : "" }) };
    void Menu.popup(
      e
        ? [
            !e.folder && { label: t("openBuild"), onSelect: () => open(e.path) },
            !e.folder && { type: "separator" as const },
            { label: t("rename"), onSelect: () => dialog.set({ kind: "rename", entry: e }) },
            { label: t("copy"), onSelect: () => dialog.set({ kind: "copy", entry: e }) },
            { label: t("delete"), onSelect: () => dialog.set({ kind: "delete", entry: e }) },
            { type: "separator" as const },
            newHere,
          ]
        : [newHere],
      ev.pagePosition,
    );
  };
  const nameDialog = () => {
    const d = dialog();
    return d && d.kind !== "delete" ? d : null;
  };
  const create = () => {
    props.onOpened();
    void newBuild().catch((err) => build.error.set(String((err as Error).message ?? err)));
  };
  return (
    <View class="flex-1 items-center" style={{ backgroundColor: C.bg }}>
      <Gate />
      <View class="w-full max-w-5xl flex-1 gap-5 px-6 pt-4 pb-4">
        {/* The launcher's title */}
        <View class="items-center gap-1">
          <Title width={560} />
          <GoldRule width={460} />
          <Subtitle>{t("buildsHint")}</Subtitle>
        </View>
        <View class="flex-row items-center gap-3">
          <Input value={typed()} onChange={search} placeholder={t("searchBuilds")} accessibilityLabel={t("searchBuilds")} class="w-72" />
          <Select
            label={t("sortBy")}
            options={sorts()}
            value={top()?.sort ?? sort() ?? "NAME"}
            onChange={(v) => sort.set(v as SortMode)}
            class="w-36"
          />
          <If when={filter()}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{`${entries().length}`}</Text>
          </If>
          <View class="flex-1" />
          {/* importing is what is done most; a new build less so */}
          <BrassButton label={t("newFolder")} dark onPress={() => dialog.set({ kind: "newFolder", parent: target() })} />
          <BrassButton label={t("create")} dark onPress={create} />
          <BrassButton label={t("importCode")} onPress={props.onImport} />
        </View>
        <If when={error() || build.error() || top.error()}>
          <Text style={{ fontFamily: BODY, fontSize: 12, color: C.red }}>{error() || build.error() || String(top.error())}</Text>
        </If>
        {/* The list, in a game card's double trim, its title plaque over the top edge */}
        <View class="flex-1" style={{ paddingTop: 22 }}>
          <View
            class="flex-1 overflow-hidden"
            onContextMenu={(ev) => menu(undefined, ev)}
            style={{
              borderWidth: 1,
              borderColor: C.trimHi,
              backgroundColor: C.panel,
              boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.7), inset 0 0 0 4px rgba(177,141,78,0.45), 0 0 36px rgba(140,170,220,0.12)",
              paddingTop: 30,
              paddingHorizontal: 4,
              paddingBottom: 4,
            }}
          >
            <Tree
              items={items()}
              expanded={expanded()}
              onExpandedChange={(e) => expanded.set(e.expanded)}
              onExpand={(e) => load(e.id)}
              onAction={(e) => open(e.id)}
              selected={selected()}
              onSelectedChange={(e) => selected.set(e.selected)}
              accessibilityLabel={t("builds")}
              class="flex-1"
              itemClass={`group ${WASH} hover:bg-[rgba(177,141,78,0.10)] selected:bg-[rgba(177,141,78,0.22)] focus-visible:bg-[rgba(177,141,78,0.16)] disabled:opacity-60`}
              renderItem={(e) => <Row entry={byId.get(e.id)} tree={e} onMenu={(ev) => menu(byId.get(e.id), ev)} />}
              empty={<Empty class="flex-1" title={top.loading() ? "" : t("emptyFolder")} description={top.loading() ? "" : t("emptyFolderHint")} />}
            />
          </View>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", pointerEvents: "box-none" }}>
            <View style={{ width: 260 }}>
              <Plaque kind={() => "dark"} height={46}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>
                  {t("builds")}
                </Text>
              </Plaque>
            </View>
          </View>
        </View>
        <View class="flex-row items-center gap-3">
          <Text class="flex-1 truncate" style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>
            {top()?.buildPath ?? ""}
            {"  ·  "}
            {t("openHint")}
          </Text>
        </View>
      </View>
      <NameDialog
        open={!!nameDialog()}
        title={t(nameDialog()?.kind === "rename" ? "rename" : nameDialog()?.kind === "copy" ? "copy" : "newFolder")}
        initial={(() => {
          const d = nameDialog();
          return d && d.kind !== "newFolder" ? (d.entry.folder ?? d.entry.name ?? "") : "";
        })()}
        where={(() => {
          const d = nameDialog();
          return d ? (d.kind === "newFolder" ? d.parent : d.entry.subPath) : "";
        })()}
        onClose={() => dialog.set(null)}
        onName={named}
      />
      <ConfirmDelete entry={(() => {
        const d = dialog();
        return d?.kind === "delete" ? d.entry : null;
      })()} onClose={() => dialog.set(null)} onDelete={remove} />
    </View>
  );
}

type Dialog = { kind: "newFolder"; parent: string } | { kind: "rename" | "copy" | "delete"; entry: BuildEntry };


/** A name for a new folder, or a new name for a build or a folder (or its copy), in `where` ("" for the top). */
function NameDialog(props: { open: boolean; title: string; initial: string; where: string; onClose: () => void; onName: (name: string) => Promise<void> }) {
  const name = signal("");
  const error = signal("");
  const busy = signal(false);
  // each opening starts from the entry's name
  effect(() => {
    if (!props.open) return;
    const first = props.initial;
    untracked(() => {
      name.set(first);
      error.set("");
    });
  });
  const done = async () => {
    if (!name().trim()) return;
    busy.set(true);
    try {
      await props.onName(name().trim());
      props.onClose();
    } catch (e) {
      error.set(String((e as Error).message ?? e));
    } finally {
      busy.set(false);
    }
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => open || props.onClose()}
      title={props.title}
      footer={
        <View class="flex-row justify-end gap-2">
          <Button label={tr("Cancel")} variant="ghost" onPress={props.onClose} />
          <Button label={t("ok")} variant="primary" busy={busy()} disabled={!name().trim()} onPress={() => void done()} />
        </View>
      }
    >
      <View class="gap-2">
        <If when={props.where}>
          <Text tone="muted" variant="caption">
            {props.where}
          </Text>
        </If>
        <Input
          value={name()}
          onChange={(v) => {
            name.set(v);
            error.set("");
          }}
          onSubmit={() => void done()}
          accessibilityLabel={t("name")}
          placeholder={t("name")}
          autoFocus
        />
        <If when={error()}>
          <Text tone="destructive" variant="caption">
            {error()}
          </Text>
        </If>
      </View>
    </Modal>
  );
}

/** Asks before deleting a build, or a folder with all it holds: it cannot be undone. */
function ConfirmDelete(props: { entry: BuildEntry | null; onClose: () => void; onDelete: (e: BuildEntry) => Promise<void> }) {
  const error = signal("");
  const busy = signal(false);
  const go = async () => {
    const e = props.entry;
    if (!e) return;
    busy.set(true);
    try {
      await props.onDelete(e);
      error.set("");
      props.onClose();
    } catch (err) {
      error.set(String((err as Error).message ?? err));
    } finally {
      busy.set(false);
    }
  };
  const close = () => {
    error.set("");
    props.onClose();
  };
  return (
    <Modal
      open={!!props.entry}
      onOpenChange={(open) => open || close()}
      title={t("delete")}
      footer={
        <View class="flex-row justify-end gap-2">
          <Button label={tr("Cancel")} variant="ghost" onPress={close} />
          <Button label={t("delete")} variant="destructive" busy={busy()} onPress={() => void go()} />
        </View>
      }
    >
      <View class="gap-2">
        <Text>
          {props.entry?.folder ? t("deleteFolder").replace("{name}", props.entry.folder) : t("deleteBuild").replace("{name}", props.entry?.name ?? "")}
        </Text>
        <If when={error()}>
          <Text tone="destructive" variant="caption">
            {error()}
          </Text>
        </If>
      </View>
    </Modal>
  );
}
