// POBT's own build editor on the official Path of Building, running with no window: POB's builds (shared with POB),
// then a build with its sidebar and pages. Every number is POB's; the screens are POBT's.
import { Clipboard, type JSX, signal, View } from "nsh";
import { Button, EmptyState, Modal, ProgressBar, TabBar, Text, TextArea, TextField, type TabItem } from "../ui";
import { BuildList } from "./BuildList";
import { FADE } from "../ui/motion";
import { t, tr } from "./i18n";
import { CalcsPage } from "./pages/Calcs";
import { ConfigPage } from "./pages/Config";
import { ItemsPage } from "./pages/Items";
import { NotesPage } from "./pages/Notes";
import { SkillsPage } from "./pages/Skills";
import { TreePage } from "./pages/Tree";
import { Pob } from "pobt/native";
import { build, exportCode, openBuild, saveBuild, service, startService, type Game } from "./session";
import { Sidebar } from "./Sidebar";
import { loadArt } from "./art";
import { ColoredText } from "./ColoredText";

export type PageKey = "tree" | "skills" | "items" | "calcs" | "config" | "notes";

/** The page shown: kept across builds, as POB keeps its tab. Pages read it to load only while shown. */
export const page = signal<PageKey>((Pob.devEnv("POBT_PAGE") as PageKey) || "tree");
/** What the editor shows: POB's builds (first), a pasted build code to open, or the open build. */
const view = signal<"list" | "import" | "build">("list");

/** The title bar's back, a level up: from a build or the import to the builds; false on the builds (the launcher is
 * next). */
export function editorBack(): boolean {
  if (view() === "list") return false;
  view.set("list");
  return true;
}
/** What the title bar's back leads to, when it is not the launcher. */
export const editorBackLabel = (): string | undefined => (view() === "list" ? undefined : t("backToBuilds"));

function Starting() {
  return (
    <View class="flex-1 items-center justify-center gap-4 p-8">
      <If
        when={service.state() === "failed"}
        else={
          <View class="w-96 gap-3">
            <Text variant="title" class="text-center">
              {t("loadingData")}
            </Text>
            <ProgressBar value={null} />
          </View>
        }
      >
        <EmptyState title={t("dataFailed")} detail={service.error()} />
      </If>
    </View>
  );
}

function OpenBuild(props: { onCancel: () => void }) {
  const text = signal("");
  const busy = signal(false);
  const own = signal("");
  // Its own failure, or the one of the build opened for it (POBT_BUILD).
  const error = Object.assign(() => own() || build.error(), { set: own.set });
  const open = async () => {
    if (!text().trim() || busy()) return;
    busy.set(true);
    error.set("");
    try {
      await openBuild(text());
      view.set("build");
    } catch (e) {
      error.set(String((e as Error).message ?? e));
    } finally {
      busy.set(false);
    }
  };
  return (
    <View class="flex-1 items-center justify-center p-8">
      <View class="w-full max-w-xl gap-3 rounded-(--radius) border border-border bg-card p-5">
        <Text variant="title">{t("importTitle")}</Text>
        <Text tone="muted">{t("importHint")}</Text>
        <TextArea
          value={text()}
          onChange={(v) => text.set(v)}
          placeholder={t("importPlaceholder")}
          accessibilityLabel={t("importPlaceholder")}
          autoFocus
          class="h-36 font-mono text-xs"
        />
        <If when={error()}>
          <Text tone="destructive" variant="caption">
            {`${t("importFailed")}: ${error()}`}
          </Text>
        </If>
        <View class="flex-row justify-end gap-2">
          <Button label={tr("Cancel")} variant="ghost" onPress={props.onCancel} />
          <Button label={t("paste")} onPress={async () => text.set(await Clipboard.readText())} />
          <Button label={t("open")} variant="primary" busy={busy()} disabled={!text().trim()} onPress={() => void open()} />
        </View>
      </View>
    </View>
  );
}

/** Save As: a name for a build never saved (or saved elsewhere), in the builds folder's top. */
function SaveAs(props: { open: boolean; onClose: () => void }) {
  const name = signal(build.sidebar()?.summary.name ?? "");
  const exists = signal(false);
  const busy = signal(false);
  const save = async (overwrite: boolean) => {
    if (!name().trim()) return;
    busy.set(true);
    try {
      const r = await saveBuild({ name: name().trim(), overwrite });
      if (r.exists) exists.set(true);
      else props.onClose();
    } finally {
      busy.set(false);
    }
  };
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("saveAs")}
      actions={
        <View class="flex-row justify-end gap-2">
          <Button label={tr("Cancel")} variant="ghost" onPress={props.onClose} />
          <If when={exists()}>
            <Button label={t("overwrite")} variant="destructive" busy={busy()} onPress={() => void save(true)} />
          </If>
          <Button label={t("save")} variant="primary" busy={busy()} disabled={!name().trim()} onPress={() => void save(false)} />
        </View>
      }
    >
      <View class="gap-2">
        <TextField
          value={name()}
          onChange={(v) => {
            name.set(v);
            exists.set(false);
          }}
          onSubmit={() => void save(false)}
          accessibilityLabel={t("buildName")}
          placeholder={t("buildName")}
          autoFocus
        />
        <If when={exists()}>
          <Text tone="warning" variant="caption">
            {t("exists")}
          </Text>
        </If>
      </View>
    </Modal>
  );
}

function Header() {
  const copied = signal(false);
  const saveState = signal<"" | "saving" | "saved">("");
  const naming = signal(false);
  const sum = () => build.sidebar()?.summary;
  const copy = async () => {
    await Clipboard.writeText(await exportCode());
    copied.set(true);
    setTimeout(() => copied.set(false), 1500);
  };
  const save = async () => {
    if (!sum()?.path) return naming.set(true);
    saveState.set("saving");
    try {
      await saveBuild();
      saveState.set("saved");
      setTimeout(() => saveState.set(""), 1500);
    } catch (e) {
      saveState.set("");
      build.error.set(String((e as Error).message ?? e));
    }
  };
  return (
    <View class="h-12 flex-row items-center gap-3 border-b border-border bg-card px-3">
      <Text variant="title" tone="primary" class="truncate tracking-widest">
        {sum()?.name ?? ""}
      </Text>
      <If when={sum()?.unsaved}>
        <View class="size-2 rounded-full bg-primary" accessibilityLabel={t("unsavedMark")} />
      </If>
      <Text tone="muted" class="truncate">
        {`${tr(sum()?.ascendClassName && sum()?.ascendClassName !== "None" ? sum()!.ascendClassName : (sum()?.className ?? ""))} · ${t("level")} ${sum()?.level ?? ""}`}
      </Text>
      <If when={sum()?.points}>
        {/* POB's own points line ("118 / 123   8 / 8"), as it draws it */}
        <ColoredText text={sum()!.points} raw class="shrink-0 font-mono text-xs" />
      </If>
      <View class="flex-1" />
      <If when={build.busy()}>
        <Text variant="caption" tone="muted">
          {t("calculating")}
        </Text>
      </If>
      <Button label={copied() ? t("copied") : t("copyCode")} size="sm" onPress={() => void copy()} />
      <Button label={t("saveAs")} size="sm" onPress={() => naming.set(true)} />
      <Button
        label={saveState() === "saving" ? t("saving") : saveState() === "saved" ? t("saved") : t("save")}
        variant="primary"
        size="sm"
        onPress={() => void save()}
      />
      <If when={naming()}>
        <SaveAs open={naming()} onClose={() => naming.set(false)} />
      </If>
    </View>
  );
}

const PAGES: Record<PageKey, () => JSX.Element> = {
  tree: () => <TreePage />,
  skills: () => <SkillsPage />,
  items: () => <ItemsPage />,
  calcs: () => <CalcsPage />,
  config: () => <ConfigPage />,
  notes: () => <NotesPage />,
};

function BuildView() {
  const tabs = (): TabItem<PageKey>[] => [
    { key: "tree", label: tr("Tree") },
    { key: "skills", label: tr("Skills") },
    { key: "items", label: tr("Items") },
    { key: "calcs", label: tr("Calcs") },
    { key: "config", label: tr("Configuration") },
    { key: "notes", label: tr("Notes") },
  ];
  return (
    <View class="flex-1">
      <Header />
      <View class="flex-1 flex-row">
        <Sidebar />
        <View class="flex-1">
          <TabBar items={tabs()} value={page()} onChange={(k) => page.set(k)} accessibilityLabel="Build" class="h-9 border-b border-border px-2" />
          <If when={build.error()}>
            <Text tone="destructive" variant="caption" class="px-3 py-1">
              {build.error()}
            </Text>
          </If>
          {/* Each page stays mounted once shown, so its state (scroll, selection) survives switching tabs. */}
          <View class="flex-1">
            <Each of={Object.keys(PAGES) as PageKey[]}>
              {(key) => (
                <View
                  class={`absolute inset-0 ${FADE}`}
                  classList={{ "opacity-0": page() !== key(), "opacity-100": page() === key() }}
                  style={{ display: page() === key() ? "flex" : "none" }}
                >
                  {PAGES[key()]()}
                </View>
              )}
            </Each>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The editor, filling its parent, on the Path of Building of `game`; `onBack` goes back to the launcher. `file`: a
 * build's XML file to open at once (POBT_BUILD, tests). */
export function BuildEditor(props: { game: Game; file?: string; onBack: () => void }) {
  // Not started, or started on the other game (chosen again in the launcher): that one stops, its build closes.
  if (service.state() === "idle" || (service.game() && service.game() !== props.game)) {
    view.set("list");
    const text = props.file ? Pob.readBuildFile(props.file) : "";
    if (props.file && !text) build.error.set(`${props.file}: not readable`);
    loadArt(props.game);
    void startService(props.game).then(async () => {
      if (text && !build.open()) {
        await openBuild(text)
          .then(() => view.set("build"))
          .catch((e) => build.error.set(String((e as Error).message ?? e)));
      }
    });
  }
  return (
    <View class="flex-1 bg-background">
      <If when={service.state() === "ready"} else={<Starting />}>
        <If when={view() === "build" && (build.open() || build.loading() !== null)} else={
          <If when={view() === "import"} else={<BuildList onImport={() => view.set("import")} onOpened={() => view.set("build")} />}>
            <OpenBuild onCancel={() => view.set("list")} />
          </If>
        }>
          <If when={build.open()} else={<Opening />}>
            <BuildView />
          </If>
        </If>
      </If>
    </View>
  );
}

/** A build being opened: shown the moment it is asked for, while POB reads it. */
function Opening() {
  return (
    <View class="flex-1">
      <View class="h-12 flex-row items-center gap-3 border-b border-border px-3">
        <Text variant="display" tone="primary" class="tracking-widest">
          {build.loading() ?? ""}
        </Text>
      </View>
      <View class="flex-1 items-center justify-center gap-3">
        <Text tone="muted">{t("loadingBuild")}</Text>
        <ProgressBar value={null} class="w-48" accessibilityLabel={t("loadingBuild")} />
      </View>
    </View>
  );
}
