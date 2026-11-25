// The Tree page of POBT's build editor: the active passive tree of the build Path of Building holds
// (service/tree.lua), drawn on one canvas, with POB's tree list, points and search. A click does what a click on POB's
// tree does (allocate the path, deallocate with dependants, change ascendancy, choose a mastery effect); the tooltip is
// POB's own, stat changes included.
import { computed, resource, Scroll, signal, View } from "nsh";
import { Button, EmptyState, ListRow, Modal, Text, TextField, Icon } from "../../ui";
import { ColoredText, plain } from "../ColoredText";
import { t, tr } from "../i18n";
import { PobControl } from "../PobControl";
import { build, type Control, pob, reload } from "../session";
import { loadArt } from "./tree/art";
import { buildModel, type Extra, loadGeometry, type TreeModel } from "./tree/model";
import { tt } from "./tree/strings";
import { type Jewel, type TipLine, TreeView } from "./tree/TreeView";

type TreeState = {
  key: string;
  alloc: number[];
  granted: number[];
  className: string;
  classId: number;
  jewels?: Jewel[];
  view?: { level: number; x: number; y: number };
  ascendancy: string;
  ascendancyName: string;
  secondary: string;
  points: string;
  pointsDetail: string;
  specs: Control;
  search: string;
  matches: number[];
  extra: Extra;
  /** TreeTab's older-tree line (POB's text and its buttons' labels), when the tree is not the latest version. */
  convert?: { text: string; button: string; allButton: string; current: string; latest: string };
};

/** A popup POB opened (its title, text and buttons). */
type PobPopup = { title: string; text: string; buttons: { id: string; label: string }[] };

type NodeInfo = {
  id: number;
  alloc: boolean;
  reachable: boolean;
  path: number[];
  depends: number[];
  lines: TipLine[];
  masteries: Mastery[];
};

type Mastery = { id: number; label: string };

type ClickAnswer = {
  done?: boolean;
  confirm?: { title: string; text: string; continue: string; connect: string };
  masteries?: Mastery[];
};

/** How many search results the list shows. */
const RESULTS = 60;

export function TreePage() {
  const state = resource(
    () => build.open() && build.revision() + 1,
    () => pob<TreeState>("tree.read"),
  );
  const geometry = resource(
    () => state()?.key,
    (key) => loadGeometry(key),
  );
  const model = computed<TreeModel | undefined>(() => {
    const g = geometry();
    const s = state();
    return g && s && g.key === s.key ? buildModel(g, s.extra) : undefined;
  });
  // POB's tree art, read once per tree and cluster jewel layout; the tree is drawn plain until it arrives
  const art = resource(
    () => model()?.key,
    (key) => loadArt(key),
  );
  const alloc = computed(() => new Set([...(state()?.alloc ?? []), ...(state()?.granted ?? [])]));
  const ascendancies = computed(() => [state()?.ascendancy ?? "", state()?.secondary ?? ""].filter(Boolean));

  // the node under the pointer, and what POB says of it
  const hovered = signal<number | null>(null);
  // the node POB is asked about: the hovered one once the pointer has rested on it 80 ms, so a quick sweep across
  // the tree does not queue a tooltip per node on POB's thread
  const asked = signal<number | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const hover = (id: number | null) => {
    hovered.set(id);
    clearTimeout(hoverTimer);
    if (id === null) asked.set(null);
    else hoverTimer = setTimeout(() => asked.set(id), 80);
  };
  const info = resource(
    () => {
      const id = asked();
      return id === null ? undefined : `${id}:${build.revision()}`;
    },
    // POB failing to say shows why in the tooltip (after its title line, which the tooltip skips), not "calculating"
    (key) => {
      const id = Number(key.split(":")[0]);
      return pob<NodeInfo>("tree.node", { id }).catch(
        (e): NodeInfo => ({
          id,
          alloc: false,
          reachable: false,
          path: [],
          depends: [],
          lines: [{ text: "" }, { text: `^xDD0022${String((e as Error).message ?? e)}` }],
          masteries: [],
        }),
      );
    },
  );
  const current = () => {
    const i = info();
    return i && i.id === hovered() ? i : undefined;
  };
  const action = () => {
    const i = current();
    const n = hovered() !== null ? model()?.byId.get(hovered()!) : undefined;
    if (!i || !n || n.kind === "classStart" || n.kind === "ascStart") return "";
    if (i.alloc) return tt("clickDeallocate");
    if (!i.reachable) return tt("noPath");
    if (n.kind === "mastery" && i.masteries.length) return tt("clickChoose");
    return tt("clickAllocate");
  };

  // search: what is typed, sent to POB's search box as typing stops
  const draft = signal<string | null>(null);
  const found = signal<{ search: string; matches: number[] } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const query = () => draft() ?? state()?.search ?? "";
  const matchIds = () => {
    const f = found();
    return f && f.search === query() ? f.matches : (state()?.matches ?? []);
  };
  const matches = computed(() => new Set(matchIds()));
  const search = (text: string) => {
    draft.set(text);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        found.set(await pob<{ search: string; matches: number[] }>("tree.search", { text }));
      } catch (e) {
        build.error.set(String((e as Error).message ?? e));
      }
    }, 300);
  };
  const results = computed(() => {
    const m = model();
    if (!m) return [];
    return matchIds()
      .map((id) => m.byId.get(id))
      .filter((n) => !!n)
      .map((n) => ({ id: n!.id, name: n!.name }));
  });
  const focus = signal<{ id: number; seq: number } | undefined>(undefined);
  const chosen = signal<number | null>(null);
  const show = (id: number) => {
    chosen.set(id);
    focus.set({ id, seq: (focus()?.seq ?? 0) + 1 });
    hover(id);
  };

  // a click, as PassiveTreeView takes it; a class change or a mastery asks first
  const confirm = signal<{ id: number; ask: NonNullable<ClickAnswer["confirm"]> } | null>(null);
  const mastery = signal<{ id: number; name: string; effects: Mastery[] } | null>(null);
  const run = async (op: string, args: unknown) => {
    build.busy.set(true);
    try {
      const answer = await pob<ClickAnswer>(op, args);
      if (answer.confirm) {
        confirm.set({ id: (args as { id: number }).id, ask: answer.confirm });
        return;
      }
      if (answer.masteries) {
        const id = (args as { id: number }).id;
        mastery.set({ id, name: model()?.byId.get(id)?.name ?? "", effects: answer.masteries });
        return;
      }
      await pob("settle");
      await reload();
    } catch (e) {
      build.error.set(String((e as Error).message ?? e));
    } finally {
      build.busy.set(false);
    }
  };
  const pick = (id: number) => {
    if (build.busy()) return;
    const n = model()?.byId.get(id);
    if (!n || n.kind === "classStart" || n.kind === "ascStart") return;
    void run("tree.click", { id });
  };

  // TreeTab's "Convert to …" buttons, by POB's own onClick: POB's confirmation (convert all) and its message after
  const convertAsk = signal<PobPopup | null>(null);
  const convertDone = signal<PobPopup | null>(null);
  const convert = async (args: { all?: boolean; button?: string }) => {
    build.busy.set(true);
    try {
      const answer = await pob<{ done?: boolean; confirm?: PobPopup; message?: PobPopup }>("tree.convert", args);
      if (answer.confirm) {
        convertAsk.set(answer.confirm);
        return;
      }
      await pob("settle");
      await reload();
      if (answer.message) convertDone.set(answer.message);
    } catch (e) {
      build.error.set(String((e as Error).message ?? e));
    } finally {
      build.busy.set(false);
    }
  };
  const lines = (text: string) => text.split("\n").map((l) => tr(plain(l)));

  return (
    <If when={build.open()} else={<EmptyState title={t("noBuild")} />}>
      <View class="flex-1">
        <View class="flex-row flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <PobControl
            control={state()?.specs}
            path={["treeTab", "controls", "specSelect"]}
            label={tt("spec")}
            class="w-56"
            onAct={(v) => void run("tree.spec", { index: v })}
          />
          <View class="flex-row items-center gap-2" accessible accessibilityLabel={`${tt("points")}: ${plain(state()?.points ?? "")}`} accessibilityHint={tt("pointsDetail")}>
            <Text variant="label" tone="muted">
              {tt("points")}
            </Text>
            <ColoredText raw text={state()?.points ?? ""} class="font-mono text-xs" />
          </View>
          <View class="flex-1" />
          <TextField value={query()} onChange={search} placeholder={tt("searchPlaceholder")} accessibilityLabel={tt("searchLabel")} class="w-64" />
          <If when={query().trim()}>
            <Text variant="caption" tone="muted">
              {matchIds().length ? `${matchIds().length} ${tt("matches")}` : tt("noMatches")}
            </Text>
          </If>
        </View>

        {/* TreeTab's line for an older tree version, with its two convert buttons */}
        <If when={state()?.convert}>
          {(c) => (
            <View class="flex-row flex-wrap items-center gap-2 border-b border-border px-4 py-1.5" role="alert">
              <Icon name="alert-triangle" size={14} class="tint-warning" />
              <Text variant="caption" tone="warning" class="flex-1">
                {tr(plain(c().text))}
              </Text>
              <Button size="sm" variant="secondary" label={tr(plain(c().allButton))} disabled={build.busy()} onPress={() => void convert({ all: true })} />
              <Button size="sm" variant="primary" label={tr(plain(c().button))} disabled={build.busy()} onPress={() => void convert({})} />
            </View>
          )}
        </If>

        <View class="flex-1 flex-row">
          <If
            when={model()}
            else={
              <EmptyState title={state.error() || geometry.error() ? tt("failed") : tt("loading")} detail={String(state.error() ?? geometry.error() ?? "") || undefined} />
            }
          >
            <TreeView
              model={model()}
              alloc={alloc()}
              className={state()?.className ?? ""}
              classId={state()?.classId ?? 0}
              art={art()}
              jewels={state()?.jewels ?? []}
              view={state()?.view}
              ascendancies={ascendancies()}
              hoverPath={current()?.path ?? []}
              hoverDepends={current()?.alloc ? (current()?.depends ?? []) : []}
              matches={matches()}
              hovered={hovered()}
              tip={current()?.lines}
              onHover={hover}
              onPick={pick}
              action={action()}
              focus={focus()}
            />
          </If>

          <If when={query().trim() && results().length}>
            <View class="w-64 border-l border-border bg-card">
              <View class="h-9 flex-row items-center border-b border-border px-3">
                <Text variant="heading" class="flex-1 truncate">
                  {tt("results")}
                </Text>
              </View>
              <Scroll class="flex-1">
                <View class="gap-0.5 p-1.5" role="list" accessibilityLabel={tt("results")}>
                  <Each of={results().slice(0, RESULTS)} key={(r) => r.id}>
                    {(r) => (
                      <View class="flex-row items-center gap-1">
                        <ListRow
                          class="flex-1"
                          selected={chosen() === r().id}
                          onPress={() => show(r().id)}
                          accessibilityLabel={tr(r().name)}
                          accessibilityHint={alloc().has(r().id) ? tt("allocated") : undefined}
                        >
                          <Text tone={alloc().has(r().id) ? "primary" : "default"} class="flex-1 truncate">
                            {tr(r().name)}
                          </Text>
                        </ListRow>
                        <If when={chosen() === r().id}>
                          <Button
                            size="sm"
                            variant={alloc().has(r().id) ? "secondary" : "primary"}
                            label={alloc().has(r().id) ? tt("deallocate") : tt("allocate")}
                            accessibilityLabel={`${alloc().has(r().id) ? tt("deallocate") : tt("allocate")} ${tr(r().name)}`}
                            disabled={build.busy()}
                            onPress={() => pick(r().id)}
                          />
                        </If>
                      </View>
                    )}
                  </Each>
                  <If when={results().length > RESULTS}>
                    <Text variant="caption" tone="muted" class="px-2.5 py-1">
                      {`+${results().length - RESULTS} ${tt("more")}`}
                    </Text>
                  </If>
                </View>
              </Scroll>
            </View>
          </If>
        </View>

        {/* POB's "Convert all to Version …" popup: its text and buttons */}
        <Modal
          open={!!convertAsk()}
          onClose={() => convertAsk.set(null)}
          title={tr(convertAsk()?.title ?? "")}
          actions={
            <Each of={convertAsk()?.buttons ?? []} key={(b) => b.id}>
              {(b) => (
                <Button
                  variant={b().id === "convert" ? "destructive" : "ghost"}
                  label={tr(b().label)}
                  onPress={() => {
                    convertAsk.set(null);
                    if (b().id !== "cancel") void convert({ all: true, button: b().id });
                  }}
                />
              )}
            </Each>
          }
        >
          <Each of={lines(convertAsk()?.text ?? "")}>{(line) => <Text>{line()}</Text>}</Each>
        </Modal>

        {/* POB's "Tree Converted" message */}
        <Modal
          open={!!convertDone()}
          onClose={() => convertDone.set(null)}
          title={tr(convertDone()?.title ?? "")}
          actions={<Button variant="primary" label={tr(convertDone()?.buttons[0]?.label ?? "Ok")} onPress={() => convertDone.set(null)} />}
        >
          <Each of={lines(convertDone()?.text ?? "")}>{(line) => <Text>{line()}</Text>}</Each>
        </Modal>

        <Modal
          open={!!confirm()}
          onClose={() => confirm.set(null)}
          title={tr(confirm()?.ask.title ?? "")}
          actions={
            <>
              <Button variant="ghost" label={tt("cancel")} onPress={() => confirm.set(null)} />
              <Button
                variant="secondary"
                label={tr(confirm()?.ask.connect ?? "")}
                onPress={() => {
                  const c = confirm();
                  confirm.set(null);
                  if (c) void run("tree.click", { id: c.id, choice: "connect" });
                }}
              />
              <Button
                variant="destructive"
                label={tr(confirm()?.ask.continue ?? "")}
                onPress={() => {
                  const c = confirm();
                  confirm.set(null);
                  if (c) void run("tree.click", { id: c.id, choice: "continue" });
                }}
              />
            </>
          }
        >
          <Each of={(confirm()?.ask.text ?? "").split("\n")}>{(line) => <Text>{tr(line())}</Text>}</Each>
        </Modal>

        <Modal
          open={!!mastery()}
          onClose={() => mastery.set(null)}
          title={`${tr(mastery()?.name ?? "")} · ${tt("chooseMastery")}`}
          actions={<Button variant="ghost" label={tt("cancel")} onPress={() => mastery.set(null)} />}
        >
          <If when={mastery()?.effects.length} else={<Text tone="muted">{tt("noEffects")}</Text>}>
            <Scroll class="max-h-96">
              <View class="gap-0.5" role="list" accessibilityLabel={tt("chooseMastery")}>
                <Each of={mastery()?.effects ?? []} key={(e) => e.id}>
                  {(e) => (
                    <ListRow
                      pressOnRelease
                      accessibilityLabel={e().label.split(" / ").map((s) => tr(s)).join(" / ")}
                      onPress={() => {
                        const m = mastery();
                        mastery.set(null);
                        if (m) void run("tree.mastery", { id: m.id, effect: e().id });
                      }}
                    >
                      <View class="flex-1 gap-0.5 py-1">
                        <Each of={e().label.split(" / ")}>{(s) => <Text>{tr(s())}</Text>}</Each>
                      </View>
                    </ListRow>
                  )}
                </Each>
              </View>
            </Scroll>
          </If>
        </Modal>
      </View>
    </If>
  );
}
