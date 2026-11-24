// The Calcs page of POBT's build editor: POB's own Calcs tab (Classes/CalcsTab.lua), read through
// ext/pobt-native/src/service/calcs.lua. Its skill controls on top, its sections in columns (offence on the left,
// defence on the right, as POB arranges them) over the page's whole width. As on go-pob's calcs page, a cell's breakdown
// opens beside the cell: a preview while pointed at or focused, pinned in a popover once pressed.
//
// Motion inventory:
// - Cell / row hover and focus: background wash (WASH, 120 ms), instant under reduced motion.
// - Section and subsection fold: the chevron turns 90° (180 ms ease-out); the rows appear without motion (dense data).
// - Breakdown preview (the pointer rests 300 ms; POB is asked as it arrives, the card waits for the answer up to 600 ms):
//   the card shows beside the pointer at its final size and only fades in (HoverCard, opacity 120 ms ease-out); it
//   fades out as the pointer leaves.
// - Pinned breakdown (press): the popover grows from the cell (POPUP: opacity and scale 95% → 100%, 180 ms ease-out),
//   and leaves the same way.
// - Breakdown content arriving: fades in (FADE, 240 ms).
// - A wide table too narrow for its columns: the fade on its right edge goes as the table reaches its end (FADE).
// - Values after a recalculation: replaced in place without motion (dense data, read side by side).
// - While POB recalculates: the page dims (FADE, 240 ms).
// - Drop-downs: their popups grow from the trigger (the ui layer's POPUP).
// All transitions carry `motion-reduce:` and stop under reduced motion.
import { computed, resource, Scroll, signal, View } from "nsh";
import { FADE, Text } from "../../ui";
import { page } from "../BuildEditor";
import { tr } from "../i18n";
import { build, pob } from "../session";
import { BreakdownCard } from "./calcs/Breakdown";
import { type CalcsData, detailCell, label, type Part, parseKey, type SectionData, statRows, type Target } from "./calcs/data";
import { headerOf, type RowEvents, Section } from "./calcs/Sections";
import { s } from "./calcs/strings";
import { Toolbar } from "./calcs/Toolbar";

/** About the width of one of POB's columns, with its gaps. */
const COLUMN = 320;
const SELECT = 1; // POB's first section: the skill selection

type Placed = { section: SectionData; si: number };

const report = (e: unknown) => build.error.set(String((e as Error)?.message ?? e));

export function CalcsPage() {
  // The page stays mounted while another is shown: it reads POB only while it is the page shown.
  const area = signal(0);
  const visible = () => page() === "calcs";
  const bump = signal(0);
  const query = signal("");
  const showAll = signal(false);
  // the cell previewed (its card last opened on hover or focus) and the cell pinned
  const hover = signal<string | undefined>(undefined);
  const pinned = signal<string | undefined>(undefined);

  const data = resource(
    () => build.open() && visible() && `${build.revision()}:${bump()}`,
    () => pob<CalcsData>("calcs.read"),
  );
  const refresh = () => bump.update((n) => n + 1);

  /** POB's breakdown of the cell `key()` names, again after each recalculation. */
  const breakdownOf = (key: () => string | undefined) =>
    resource(
      () => visible() && key() && `${key()}#${build.revision()}#${bump()}`,
      async (src) => {
        const k = src.split("#")[0]!;
        return { key: k, parts: (await pob<{ parts: Part[] }>("calcs.breakdown", parseKey(k))).parts };
      },
    );
  const peek = breakdownOf(hover);
  const pin = breakdownOf(pinned);

  const matches = (text: string | undefined) => {
    const q = query().trim().toLowerCase();
    if (!q) return true;
    const en = label(text).toLowerCase();
    return !!en && (en.includes(q) || tr(label(text)).toLowerCase().includes(q));
  };

  const events: RowEvents = {
    pinned: () => pinned(),
    pin: (k) => pinned.set(k),
    peek: (k) => hover.set(k),
    ready: (k) => peek()?.key === k && !peek.loading(),
    detail: (k, isPinned) => {
      const r = isPinned ? pin : peek;
      return (
        <BreakdownCard
          title={titleOf(k)}
          parts={r()?.key === k ? r()!.parts : []}
          loading={r.loading() || r()?.key !== k}
          pinned={isPinned}
          inset={isPinned}
          onUnpin={() => pinned.set(undefined)}
        />
      );
    },
    matches,
    collapse: (section, sub, collapsed) => {
      pob("calcs.collapse", { section, sub, collapsed }).then(refresh, report);
    },
  };

  const showMinion = (on: boolean) => {
    pob("calcs.showMinion", { on }).then(refresh, report);
  };

  /** The sections shown (the skill selection apart), wide ones on top, the others in columns. */
  const layout = computed(() => {
    const d = data();
    const placed: Placed[] = (d?.sections ?? [])
      .map((section, i) => ({ section, si: i + 1 }))
      .filter(({ section, si }) => si !== SELECT && (section.enabled || showAll()))
      .filter(({ section }) => !query().trim() || section.subsections.some((sub) => statRows(sub).some((r) => r.label && matches(r.label))));
    const n = Math.max(1, Math.floor(area() / COLUMN)); // area() is 0 until laid out: one column
    // CalcsTab:Draw: offence (group 1) in the first columns, defence (groups 2 and 3) in the last
    const defence = n >= 2 ? Math.max(1, Math.round((n * 2) / 5)) : 0;
    const offence = n - defence;
    const cols: Placed[][] = Array.from({ length: n }, () => []);
    const heights = new Array<number>(n).fill(0);
    for (const p of placed.filter((p) => p.section.cols < 3)) {
      const [from, to] = p.section.group === 1 || defence === 0 ? [0, offence] : [offence, n];
      let col = from;
      for (let c = from; c < to; c++) if (heights[c]! < heights[col]!) col = c;
      cols[col]!.push(p);
      heights[col]! += height(p.section);
    }
    return { wide: placed.filter((p) => p.section.cols >= 3), cols };
  });

  /** What the breakdown is of: the section and the row (with its damage type in a wide section). */
  const titleOf = (key: string | undefined) => {
    if (!key) return undefined;
    const t: Target = parseKey(key);
    const section = data()?.sections[t.section - 1];
    const sub = section?.subsections[t.sub - 1];
    const row = sub?.rows.find((r) => r.row === t.row);
    if (!section || !sub || !row) return undefined;
    const head = section.cols >= 3 ? headerOf(sub, t.col) : "";
    return {
      section: t.section === SELECT ? s("buffs") : tr(label(section.subsections[0]?.label)),
      row: [tr(label(row.label)), head && tr(label(head))].filter(Boolean).join(" · "),
    };
  };

  const select = () => data()?.sections[SELECT - 1];
  const selectHasRows = () => !!select()?.subsections.some((sub) => statRows(sub).some((r) => detailCell(r) || r.cells.length));

  return (
    <View class="flex-1">
      <Toolbar
        select={select()}
        showMinion={!!data()?.showMinion}
        onShowMinion={showMinion}
        query={query()}
        onQuery={(q) => query.set(q)}
        showAll={showAll()}
        onShowAll={(on) => showAll.set(on)}
      />
      <View class={`flex-1 ${FADE}`} classList={{ "opacity-60": build.busy() }} onLayout={(e) => area.set(e.bounds.size.width)}>
        <Scroll class="flex-1" contentClass="gap-2 p-3">
          <If when={data.error()}>
            <Text tone="destructive" variant="caption">
              {`${s("failed")}: ${String((data.error() as Error)?.message ?? data.error())}`}
            </Text>
          </If>
          <If when={!data() && !data.error()}>
            <Text variant="caption" tone="muted">
              {s("calculating")}
            </Text>
          </If>
          <If when={selectHasRows()}>
            <Section section={select()!} si={SELECT} events={events} narrow title={s("buffs")} />
          </If>
          <Each of={layout().wide} key="index">
            {(p) => <Section section={p().section} si={p().si} events={events} />}
          </Each>
          <View class="flex-row items-start gap-2">
            <Each of={layout().cols} key="index">
              {(col) => (
                <View class="flex-1 gap-2">
                  <Each of={col()} key="index">
                    {(p) => <Section section={p().section} si={p().si} events={events} />}
                  </Each>
                </View>
              )}
            </Each>
          </View>
          <If when={data() && query().trim() && !layout().wide.length && layout().cols.every((c) => !c.length)}>
            <Text variant="caption" tone="muted">
              {s("noMatch")}
            </Text>
          </If>
        </Scroll>
      </View>
    </View>
  );
}

/** About how many rows a section takes, to balance the columns. */
function height(section: SectionData): number {
  if (!section.enabled) return 1;
  let h = 2;
  section.subsections.forEach((sub, i) => {
    if (i > 0) h += 1;
    if (i === 0 ? !sub.collapsed : !sub.collapsed && !section.subsections[0]?.collapsed) h += statRows(sub).length;
  });
  return h;
}
