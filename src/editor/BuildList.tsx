// The editor's first screen: the builds Path of Building keeps, in its own builds folder and as its build list shows
// them (Modules/BuildListHelpers.lua: folders first, POB's sort and search). Opening one and saving writes the same
// file, so Path of Building and POBT share every build.
import { effect, resource, signal, untracked, View } from "nsh";
import { Tree, type TreeEntry, type TreeItem } from "nsh/base";
import { shellInfo } from "nsh/updater";
import { Pob } from "pobt/native";
import { Button, EmptyState, Icon, Select, Text, TextField } from "../ui";
import { BODY, BrassButton, C, DISPLAY, Gate, GoldRule, Plaque, PressButton, Subtitle, Title } from "../ui/launcher";
import { WASH } from "../ui/motion";
import { t, tr } from "./i18n";
import { build, type BuildEntry, listBuilds, newBuild, openBuild, openFile, type SortMode } from "./session";

/** The folders expanded and the sort: kept while the editor is open, as POB keeps them. */
const expanded = signal<string[]>([]);
const sort = signal<SortMode | undefined>(undefined);
/** Development only (a run with no packaged version): the list shows the project's test builds (assets/builds). */
const DEV = !shellInfo().version;
const devShown = signal(false);
function devEntries(filter: string): BuildEntry[] {
  const list = JSON.parse(Pob.devBuilds()) as { name: string; path: string }[];
  const f = filter.toLowerCase();
  return list.filter((b) => !f || b.name.toLowerCase().includes(f)).map((b) => ({ name: b.name, path: b.path, subPath: "" }) as BuildEntry);
}

function ago(seconds?: number): string {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A folder's id in the tree: its sub path ("Act/" for Builds/Act). */
const folderId = (e: BuildEntry) => `${e.subPath}${e.folder}/`;

function Row(props: { entry?: BuildEntry; tree: TreeEntry }) {
  const e = () => props.entry;
  const cls = () => {
    const a = e()?.ascendClassName;
    return tr(a && a !== "None" ? a : (e()?.className ?? ""));
  };
  return (
    <View class="h-10 flex-1 flex-row items-center gap-3 pr-4" style={{ paddingLeft: 12 + props.tree.depth * 18 }}>
      <View class="w-4 items-center">
        <If when={props.tree.folder} else={<View style={{ width: 5, height: 5, backgroundColor: C.trim, transform: [{ rotate: "45deg" }] }} />}>
          <View class="transition-transform duration-180 group-aria-expanded:rotate-90 motion-reduce:transition-none">
            <Icon name="chevron-right" size={14} color={C.trimHi} />
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
  const entries = () => (devShown() ? devEntries(filter()) : (top()?.list ?? []));
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
    void (devShown() ? openBuild(Pob.readBuildFile(e.path), e.name) : openFile(e)).catch((err) =>
      build.error.set(`${t("openFailed")}: ${String((err as Error).message ?? err)}`),
    );
  };
  const sorts = () => [
    { value: "NAME", title: t("sortName") },
    { value: "CLASS", title: t("sortClass") },
    { value: "EDITED", title: t("sortEdited") },
    { value: "LEVEL", title: t("sortLevel") },
  ];
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
          <TextField value={typed()} onChange={search} placeholder={t("searchBuilds")} accessibilityLabel={t("searchBuilds")} class="w-72" />
          <Select
            accessibilityLabel={t("sortBy")}
            items={sorts()}
            value={top()?.sort ?? sort() ?? "NAME"}
            onChange={(v) => sort.set(v as SortMode)}
            class="w-36"
          />
          <If when={filter()}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{`${entries().length}`}</Text>
          </If>
          <View class="flex-1" />
          <BrassButton label={t("importCode")} onPress={props.onImport} />
          {/* New: the launcher's red banner */}
          <PressButton onPress={create} style={{ width: 200 }}>
            {(down) => (
              <Plaque kind={() => "red"} height={44} pressed={down}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 2, color: "#f6e6c2" }}>{t("create")}</Text>
              </Plaque>
            )}
          </PressButton>
        </View>
        <If when={error() || build.error() || top.error()}>
          <Text style={{ fontFamily: BODY, fontSize: 12, color: C.red }}>{error() || build.error() || String(top.error())}</Text>
        </If>
        {/* The list, in a game card's double trim, its title plaque over the top edge */}
        <View class="flex-1" style={{ paddingTop: 22 }}>
          <View
            class="flex-1 overflow-hidden"
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
              accessibilityLabel={t("builds")}
              class="flex-1"
              itemClass={`group ${WASH} hover:bg-[rgba(177,141,78,0.10)] selected:bg-[rgba(177,141,78,0.22)] focus-visible:bg-[rgba(177,141,78,0.16)] disabled:opacity-60`}
              renderItem={(e) => <Row entry={byId.get(e.id)} tree={e} />}
              empty={<EmptyState title={top.loading() ? "" : t("emptyFolder")} detail={top.loading() ? "" : t("emptyFolderHint")} />}
            />
          </View>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", pointerEvents: "box-none" }}>
            <View style={{ width: 260 }}>
              <Plaque kind={() => "dark"} height={46}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>
                  {devShown() ? t("devBuilds") : t("builds")}
                </Text>
              </Plaque>
            </View>
          </View>
        </View>
        <View class="flex-row items-center gap-3">
          <Text class="flex-1 truncate" style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>
            {devShown() ? "assets/builds" : (top()?.buildPath ?? "")}
            {"  ·  "}
            {t("openHint")}
          </Text>
          <If when={DEV}>
            <Button label={devShown() ? t("allBuilds") : t("devBuilds")} variant="ghost" size="sm" onPress={() => devShown.set(!devShown())} />
          </If>
        </View>
      </View>
    </View>
  );
}
