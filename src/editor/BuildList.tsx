// The editor's first screen: the builds Path of Building keeps, in its own builds folder and as its build list shows
// them (Modules/BuildListHelpers.lua: folders first, POB's sort and search). Opening one and saving writes the same
// file, so Path of Building and POBT share every build.
import { List, resource, signal, View } from "nsh";
import { shellInfo } from "nsh/updater";
import { Pob } from "pobt/native";
import { Backdrop, Button, EmptyState, Framed, ListRow, Rule, Select, Text, TextField } from "../ui";
import { t, tr } from "./i18n";
import { type BuildEntry, listBuilds, newBuild, openBuild, openFile, type SortMode } from "./session";

/** The folder shown and the sort: kept while the editor is open, as POB keeps them. */
const subPath = signal("");
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

function Row(props: { entry: BuildEntry; onOpen: (e: BuildEntry) => void }) {
  const e = () => props.entry;
  const cls = () => {
    const a = e().ascendClassName;
    return tr(a && a !== "None" ? a : (e().className ?? ""));
  };
  return (
    <ListRow
      accessibilityLabel={e().folder ?? e().name ?? ""}
      onPress={() => props.onOpen(e())}
      class="h-12 flex-row items-center gap-3 border-b border-trim/25 px-4"
    >
      <View class="w-6 items-center">
        <Text tone={e().folder ? "primary" : "muted"}>{e().folder ? "▸" : "◆"}</Text>
      </View>
      <View class="flex-1 gap-0.5">
        <Text class="truncate" tone={e().folder ? "primary" : "default"}>
          {e().folder ?? e().name ?? ""}
        </Text>
        <If when={!e().folder && e().subPath}>
          <Text variant="caption" tone="muted" class="truncate">
            {e().subPath}
          </Text>
        </If>
      </View>
      <If when={!e().folder}>
        <Text tone="muted" class="w-40 truncate">
          {cls()}
        </Text>
        <Text tone="muted" class="w-20 text-right font-mono">
          {e().level ? `${t("level")} ${e().level}` : ""}
        </Text>
      </If>
      <Text variant="caption" tone="muted" class="w-36 text-right font-mono">
        {ago(e().modified)}
      </Text>
    </ListRow>
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
  const folder = resource(
    () => ({ sub: subPath(), filter: filter(), sort: sort() }),
    (k) => listBuilds(k.sub, k.filter, k.sort),
  );
  const open = async (e: BuildEntry) => {
    if (e.folder) {
      subPath.set(`${e.subPath}${e.folder}/`);
      return;
    }
    error.set("");
    try {
      if (devShown()) await openBuild(Pob.readBuildFile(e.path), e.name);
      else await openFile(e);
      props.onOpened();
    } catch (err) {
      error.set(`${t("openFailed")}: ${String((err as Error).message ?? err)}`);
    }
  };
  const shown = () => (devShown() ? devEntries(filter()) : (folder()?.list ?? []));
  // The folders down to the one shown, each a step back up.
  const crumbs = () => {
    const parts = subPath().split("/").filter(Boolean);
    return parts.map((name, i) => ({ name, sub: `${parts.slice(0, i + 1).join("/")}/` }));
  };
  const sorts = () => [
    { value: "NAME", title: t("sortName") },
    { value: "CLASS", title: t("sortClass") },
    { value: "EDITED", title: t("sortEdited") },
    { value: "LEVEL", title: t("sortLevel") },
  ];
  return (
    <View class="flex-1 items-center bg-background">
      <Backdrop />
      <View class="w-full max-w-5xl flex-1 gap-4 px-6 pt-6 pb-4">
        <View class="items-center gap-1">
          <Text variant="display" tone="primary" class="text-3xl tracking-[0.3em]">
            {t("builds")}
          </Text>
          <Rule class="w-96" />
          <Text tone="muted" class="text-center">
            {t("buildsHint")}
          </Text>
        </View>
        <View class="flex-row items-center gap-2">
          <TextField value={typed()} onChange={search} placeholder={t("searchBuilds")} accessibilityLabel={t("searchBuilds")} class="w-72" />
          <Select
            accessibilityLabel={t("sortBy")}
            items={sorts()}
            value={folder()?.sort ?? sort() ?? "NAME"}
            onChange={(v) => sort.set(v as SortMode)}
            class="w-36"
          />
          <View class="flex-1" />
          <Button label={t("importCode")} onPress={props.onImport} />
          <Button
            label={t("create")}
            variant="primary"
            onPress={() =>
              void newBuild()
                .then(props.onOpened)
                .catch((err) => error.set(String((err as Error).message ?? err)))
            }
          />
        </View>
        <View class="flex-row flex-wrap items-center gap-1">
          <Button
            label={t("allBuilds")}
            variant="ghost"
            size="sm"
            selected={!devShown() && !subPath()}
            onPress={() => (devShown.set(false), subPath.set(""))}
          />
          <Each of={devShown() ? [] : crumbs()}>
            {(c) => (
              <View class="flex-row items-center gap-1">
                <Text tone="muted">/</Text>
                <Button label={c().name} variant="ghost" size="sm" selected={c().sub === subPath()} onPress={() => subPath.set(c().sub)} />
              </View>
            )}
          </Each>
          <If when={filter()}>
            <Text variant="caption" tone="muted" class="ml-2">
              {`${shown().length}`}
            </Text>
          </If>
          <If when={DEV}>
            <View class="flex-1" />
            <Button label={t("devBuilds")} variant="ghost" size="sm" selected={devShown()} onPress={() => devShown.set(true)} />
          </If>
        </View>
        <If when={error() || folder.error()}>
          <Text tone="destructive" variant="caption">
            {error() || String(folder.error())}
          </Text>
        </If>
        <Framed class="flex-1 overflow-hidden">
          <List
            each={shown()}
            keyExtractor={(e) => e.path}
            style={{ flex: 1 }}
            empty={
              <EmptyState title={folder.loading() ? "" : t("emptyFolder")} detail={folder.loading() ? "" : t("emptyFolderHint")} />
            }
          >
            {(e) => <Row entry={e()} onOpen={(x) => void open(x)} />}
          </List>
        </Framed>
        <Text variant="caption" tone="muted" class="truncate">
          {devShown() ? "assets/builds" : (folder()?.buildPath ?? "")}
        </Text>
      </View>
    </View>
  );
}
