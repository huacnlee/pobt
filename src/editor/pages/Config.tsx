// The Configuration page of POBT's build editor, over Path of Building's own config tab (service/config.lua): the
// options, which of them affect the build, which are modified or invalid and what their tooltips say are POB's.
// Changes go through POB's own controls, so POB's handlers make them.
import { cleanup, computed, resource, Scroll, signal, View } from "nsh";
import { Button, Checkbox, EmptyState, HoverCard, Panel, Select, Text, TextField } from "../../ui";
import { WASH } from "../../ui/motion";
import { ColoredText, plain } from "../ColoredText";
import { type TipLine, TipLines } from "../PobTip";
import { page } from "../BuildEditor";
import { language, t, tr } from "../i18n";
import { build, change, type Control, pob } from "../session";

type Row = {
  /** Absent on a heading. */
  var?: string;
  type?: string;
  label: string;
  /** POB shows it (it affects the build, or it is set although invalid). */
  shown: boolean;
  /** POB shows it under "Show All Configurations". */
  shownAll: boolean;
  modified?: boolean;
  invalid?: boolean;
  control?: Control;
};
type Section = { name: string; col: number; rows: Row[] };
type ConfigData = { sets: string[]; activeSet: number; sections: Section[] };

type OptionView = { kind: "option"; key: string; row: Row; relevant: boolean };
type HeadingView = { kind: "heading"; key: string; label: string };
type SectionView = { name: string; total: number; modified: number; hidden: number; rows: (OptionView | HeadingView)[] };
type Filter = { q: string; showAll: boolean; modOnly: boolean };

// The options go-pob's config page puts first (frontend/src/lib/design/config.ts MOST_USED).
const MOST_USED = [
  "usePowerCharges",
  "overridePowerCharges",
  "useFrenzyCharges",
  "useEnduranceCharges",
  "enemyIsBoss",
  "presetBossSkills",
  "enemyLevel",
  "bandit",
  "conditionMoving",
  "conditionFullLife",
];

const stripColon = (s: string) => s.replace(/\s*[:：]\s*$/, "");

function configView(data: ConfigData, f: Filter) {
  const needle = f.q.trim().toLowerCase();
  const matches = (label: string) => !needle || plain(label).toLowerCase().includes(needle) || plain(tr(label)).toLowerCase().includes(needle);
  const byVar = new Map<string, OptionView>();
  let shown = 0;
  let modifiedAll = 0;
  let total = 0;
  const sections: SectionView[] = [];
  for (const s of data.sections) {
    const rows: (OptionView | HeadingView)[] = [];
    let modified = 0;
    let hidden = 0;
    let count = 0;
    let heading: HeadingView | undefined;
    s.rows.forEach((row, i) => {
      if (!row.var) {
        heading = (f.showAll ? row.shownAll : row.shown) ? { kind: "heading", key: `h${i}`, label: row.label } : undefined;
        return;
      }
      count++;
      total++;
      const o: OptionView = { kind: "option", key: row.var, row, relevant: row.shown && !row.invalid };
      byVar.set(row.var, o);
      if (row.modified) modified++;
      const visible = f.showAll ? row.shownAll || row.shown : row.shown;
      if (!visible) hidden++;
      if (!visible || !matches(row.label) || (f.modOnly && !row.modified)) return;
      if (heading) rows.push(heading);
      heading = undefined;
      rows.push(o);
    });
    if (!count) continue;
    modifiedAll += modified;
    shown += rows.filter((r) => r.kind === "option").length;
    sections.push({ name: s.name, total: count, modified, hidden, rows });
  }
  const most = MOST_USED.map((k) => byVar.get(k)).filter((o): o is OptionView => !!o && matches(o.row.label) && (!f.modOnly || !!o.row.modified));
  return { sections, most, shown, modified: modifiedAll, total };
}

/** Sections in two columns, each going to the shorter one (the page is too narrow for POB's three). */
function twoColumns(sections: SectionView[]): SectionView[][] {
  const cols: SectionView[][] = [[], []];
  const height = [0, 0];
  for (const s of sections) {
    if (!s.rows.length) continue;
    const c = height[0] <= height[1] ? 0 : 1;
    cols[c].push(s);
    height[c] += s.rows.length + 2;
  }
  return cols;
}

/** What the user set and POB has not read back yet, by option: shown in place of POB's control meanwhile. */
const pending = signal<Record<string, Partial<Control>>>({});
/** Tooltips POB gave, by option and calculation. */
const tips = signal<Record<string, TipLine[] | null>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function forget(key: string, mark: Partial<Control>) {
  pending.update((p) => {
    if (p[key] !== mark) return p;
    const { [key]: _, ...rest } = p;
    return rest;
  });
}

/** Sets option `key` through its POB control: now (a check box, a list) or as typing stops (a number, text). */
function setOption(key: string, value: number | string | boolean, shown: Partial<Control>, typed = false) {
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.delete(key);
  const mark = { ...shown };
  pending.update((p) => ({ ...p, [key]: mark }));
  const send = () => {
    const rev = build.revision();
    // the new read takes the mark away; without a recalculation there is none, so it goes here
    void change("config.set", { var: key, value }).finally(() => build.revision() === rev && forget(key, mark));
  };
  if (typed) timers.set(key, setTimeout(() => (timers.delete(key), send()), 400));
  else send();
}

/** Tooltips are POB's for one calculation: cached by option and revision. */
const tipKey = (key: string) => `${key}@${build.revision()}`;

function loadTip(key: string) {
  const k = tipKey(key);
  if (tips()[k] !== undefined) return;
  tips.update((t) => ({ ...t, [k]: null }));
  pob<{ lines: TipLine[] }>("config.tooltip", { var: key })
    .then((r) => tips.update((t) => ({ ...t, [k]: r.lines })))
    .catch(() => tips.update((t) => ({ ...t, [k]: [] })));
}

export function ConfigPage() {
  const q = signal("");
  const showAll = signal(false);
  const modOnly = signal(false);
  cleanup(() => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  });

  const data = resource(
    // read while the page shows: POB recalculates on every change elsewhere too
    () => page() === "config" && build.open() && build.revision() + 1,
    async () => {
      const before = pending();
      const d = await pob<ConfigData>("config.read");
      tips.set({}); // the old calculation's tooltips go
      // what POB has read back since the read began is shown from POB's controls again
      for (const [k, mark] of Object.entries(before)) if (!timers.has(k)) forget(k, mark);
      return d;
    },
  );
  const view = computed(() => {
    const d = data();
    return d ? configView(d, { q: q(), showAll: showAll(), modOnly: modOnly() }) : undefined;
  });
  const columns = computed(() => twoColumns(view()?.sections ?? []));
  const sets = () => (data()?.sets ?? []).map((title, i) => ({ value: String(i + 1), title: tr(title) }));

  return (
    <If when={build.open()} else={<EmptyState title={t("noBuild")} />}>
      <If when={view()} else={<EmptyState title={data.error() ? String((data.error() as Error).message ?? data.error()) : t("calculating")} />}>
        {(v) => (
          <View class="flex-1">
            <View class="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
              <TextField value={q()} onChange={(x) => q.set(x)} placeholder={s("filter")} accessibilityLabel={s("filter")} class="w-56" />
              <Checkbox checked={modOnly()} onChange={(on) => modOnly.set(on)} label={s("modifiedOnly")} accessibilityLabel={s("modifiedOnly")} />
              <Checkbox checked={showAll()} onChange={(on) => showAll.set(on)} label={s("showAll")} accessibilityLabel={s("showAll")} />
              <View class="flex-1" />
              <If when={sets().length > 1}>
                <View class="flex-row items-center gap-2">
                  <Text variant="label" tone="muted">
                    {s("configSet")}
                  </Text>
                  <Select
                    items={sets()}
                    value={String(data()?.activeSet ?? 1)}
                    onChange={(i) => {
                      if (Number(i) !== data()?.activeSet) void change("config.selectSet", { index: Number(i) });
                    }}
                    accessibilityLabel={s("configSet")}
                    class="w-44"
                  />
                </View>
              </If>
              <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                {summary(v().shown, v().modified, v().total)}
              </Text>
            </View>
            <Scroll class="flex-1" contentClass="gap-3 p-4">
              <If when={v().most.length}>
                <Panel title={s("mostUsed")}>
                  <View class="flex-row gap-3 py-1">
                    <Each of={[0, 1]}>
                      {(c) => (
                        <View class="flex-1">
                          <Each of={v().most.filter((_, i) => i % 2 === c())} key={(o) => o.key}>
                            {(o) => <OptionRow option={o()} />}
                          </Each>
                        </View>
                      )}
                    </Each>
                  </View>
                </Panel>
              </If>
              <If when={columns()[0].length || columns()[1].length} else={<EmptyState title={s("noMatch")} />}>
                <View class="flex-row items-start gap-3">
                  <Each of={[0, 1]}>
                    {(c) => (
                      <View class="flex-1 gap-3">
                        <Each of={columns()[c()]} key={(sec) => sec.name}>
                          {(sec) => <SectionPanel section={sec()} showAll={showAll()} />}
                        </Each>
                      </View>
                    )}
                  </Each>
                </View>
              </If>
            </Scroll>
          </View>
        )}
      </If>
    </If>
  );
}

function SectionPanel(props: { section: SectionView; showAll: boolean }) {
  return (
    <Panel
      title={tr(props.section.name)}
      actions={
        <Text variant="caption" tone="muted">
          {count(props.section.total, props.section.modified)}
        </Text>
      }
    >
      <View class="py-1">
        <Each of={props.section.rows} key={(r) => r.key}>
          {(r) =>
            r().kind === "heading" ? (
              <View class="border-b border-border px-3 pt-2 pb-1">
                <ColoredText text={(r() as HeadingView).label} class="text-xs font-semibold text-muted-foreground" />
              </View>
            ) : (
              <OptionRow option={r() as OptionView} />
            )
          }
        </Each>
        <If when={!props.showAll && props.section.hidden > 0}>
          <Text variant="caption" tone="muted" class="px-3 pt-1 pb-1">
            {hiddenMore(props.section.hidden)}
          </Text>
        </If>
      </View>
    </Panel>
  );
}

function OptionRow(props: { option: OptionView }) {
  const row = () => props.option.row;
  const key = props.option.key; // rows are keyed by option
  const kind = props.option.row.control?.kind ?? "other";
  const ctl = (): Control => ({ ...(row().control ?? { kind: "other", shown: true, enabled: true }), ...(pending()[key] ?? {}) });
  const label = () => stripColon(tr(row().label));
  const name = () => plain(label());
  const notes = () =>
    [row().modified && s("modifiedTip"), !row().shown && s("irrelevant")].filter((x): x is string => !!x);
  const tipLines = () => tips()[tipKey(key)];
  // POB's name of the option, its tooltip, then what POBT notes about it
  const tipCard = (): TipLine[] => [
    { text: stripColon(row().label), size: 20 },
    ...(tipLines() ?? []),
    ...notes().map((n) => ({ text: `^8${n}`, size: 14 })),
  ];
  const set = (value: number | string | boolean, shown: Partial<Control>, typed = false) => setOption(key, value, shown, typed);

  return (
    <HoverCard
      content={() => <TipLines lines={tipCard()} />}
      onPrepare={() => loadTip(key)}
      ready={() => !!tipLines()}
      cardClass="w-[360px]"
    >
      <View class={`min-h-8 flex-row items-center gap-2 px-3 py-0.5 ${WASH} hover:bg-accent/40`}>
        <View class={`h-1.5 w-1.5 rounded-full ${row().modified ? "bg-primary" : ""}`} />
        <ColoredText
          raw
          text={label()}
          class={`flex-1 ${row().invalid ? "text-warning" : !props.option.relevant ? "text-muted-foreground" : ""}`}
        />
        <If when={row().modified}>
          <Button
            variant="ghost"
            size="sm"
            label="↺"
            accessibilityLabel={`${s("reset")}: ${name()}`}
            tooltip={s("reset")}
            onPress={() => void change("config.reset", { var: key })}
            class="w-7 px-0"
          />
        </If>
        {kind === "check" ? (
          <Checkbox checked={!!ctl().checked} onChange={(on) => set(on, { checked: on })} accessibilityLabel={name()} />
        ) : kind === "list" ? (
          <Select
            items={(ctl().items ?? []).map((title, i) => ({ value: String(i + 1), title: plain(tr(title)) }))}
            value={ctl().sel ? String(ctl().sel) : null}
            onChange={(i) => {
              if (Number(i) !== ctl().sel) set(Number(i), { sel: Number(i) });
            }}
            accessibilityLabel={name()}
            class="w-44"
          />
        ) : kind === "edit" && row().type === "text" ? (
          <TextField value={ctl().text ?? ""} onChange={(x) => set(x, { text: x }, true)} accessibilityLabel={name()} class="w-44" />
        ) : kind === "edit" ? (
          <TextField
            value={ctl().text ?? ""}
            onChange={(x) => {
              const text = numberText(row().type, x);
              set(text, { text }, true);
            }}
            placeholder={ctl().placeholder == null ? undefined : String(ctl().placeholder)}
            accessibilityLabel={name()}
            class="w-24 font-mono"
          />
        ) : null}
      </View>
    </HoverCard>
  );
}

/** What a number option's edit box takes, by its filter in ConfigTab.lua: digits for a count, a sign too for an
 * integer, a point too for a float. */
function numberText(type: string | undefined, text: string): string {
  if (type === "integer" || type === "countAllowZero") return text.replace(/[^-\d]/g, "");
  if (type === "float") return text.replace(/[^\d.]/g, "");
  return text.replace(/\D/g, "");
}

// What only this page says.
const STRINGS = {
  en: {
    filter: "Filter options",
    modifiedOnly: "Modified only",
    showAll: "Show options that don't affect this build",
    configSet: "Config set",
    mostUsed: "Most used",
    reset: "Reset to default",
    modifiedTip: "• Modified from default",
    irrelevant: "Does not affect this build",
    noMatch: "No options match",
    summary: "{shown} shown · {modified} modified · {total} in total",
    count: "{total} options",
    countModified: "{total} options · {modified} modified",
    hidden: "+ {n} more, shown only when the build uses them",
  },
  "zh-rCN": {
    filter: "筛选选项",
    modifiedOnly: "仅显示已修改",
    showAll: "显示不影响此构建的选项",
    configSet: "配置方案",
    mostUsed: "常用",
    reset: "恢复默认",
    modifiedTip: "• 已修改（非默认值）",
    irrelevant: "不影响此构建",
    noMatch: "没有匹配的选项",
    summary: "显示 {shown} 项 · 已修改 {modified} 项 · 共 {total} 项",
    count: "{total} 项",
    countModified: "{total} 项 · 已修改 {modified} 项",
    hidden: "另有 {n} 项，仅在构建用到时显示",
  },
  "zh-rTW": {
    filter: "篩選選項",
    modifiedOnly: "僅顯示已修改",
    showAll: "顯示不影響此配置的選項",
    configSet: "設定方案",
    mostUsed: "常用",
    reset: "恢復預設",
    modifiedTip: "• 已修改（非預設值）",
    irrelevant: "不影響此配置",
    noMatch: "沒有符合的選項",
    summary: "顯示 {shown} 項 · 已修改 {modified} 項 · 共 {total} 項",
    count: "{total} 項",
    countModified: "{total} 項 · 已修改 {modified} 項",
    hidden: "另有 {n} 項，僅在配置用到時顯示",
  },
  "ko-KR": {
    filter: "옵션 필터",
    modifiedOnly: "수정된 항목만",
    showAll: "이 빌드에 영향 없는 옵션 표시",
    configSet: "설정 세트",
    mostUsed: "자주 쓰는 옵션",
    reset: "기본값으로",
    modifiedTip: "• 기본값에서 수정됨",
    irrelevant: "이 빌드에 영향 없음",
    noMatch: "일치하는 옵션 없음",
    summary: "{shown}개 표시 · {modified}개 수정 · 전체 {total}개",
    count: "{total}개 옵션",
    countModified: "{total}개 옵션 · {modified}개 수정",
    hidden: "+ {n}개 더, 빌드에서 쓸 때만 표시",
  },
} as const;

type Key = keyof (typeof STRINGS)["en"];

function s(key: Key): string {
  const lang = language();
  return (lang && STRINGS[lang as keyof typeof STRINGS]?.[key]) || STRINGS.en[key];
}

const fill = (text: string, vars: Record<string, number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const summary = (shown: number, modified: number, total: number) => fill(s("summary"), { shown, modified, total });
const count = (total: number, modified: number) => fill(s(modified ? "countModified" : "count"), { total, modified });
const hiddenMore = (n: number) => fill(s("hidden"), { n });
