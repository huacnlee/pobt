// The Calcs page's sections, as POB's Calcs tab has them (Classes/CalcSectionControl.lua, Modules/CalcSections.lua):
// a card per section in POB's colour, its subsections folding as POB's +/- buttons do, one-column sections as label /
// value rows, three-column ones (CalcSections.lua width 3) as tables across damage types. A cell with a breakdown
// previews it beside the pointer, and pins that card when pressed.
import { type JSX, Scroll, signal, View } from "nsh";
import { FADE, HoverCard, Text, WASH } from "../../../ui";
import { tr } from "../../i18n";
import { type Cell, detailCell, hex, isHeaderRow, label, type Row, type SectionData, statRows, type Sub, targetKey } from "./data";
import { PobText } from "./PobText";
import { s } from "./strings";

/** What the sections share with the page: the pinned cell, what pressing and pointing at a cell does, the
 *  breakdown card of a cell (a preview, or the pinned one), the search, and folding a subsection. */
export type RowEvents = {
  pinned: () => string | undefined;
  /** A press on the cell: pins its card, or unpins it if pinned. */
  press: (key: string) => void;
  /** The pinned card of `key` went (Escape, a press outside it). */
  unpin: (key: string) => void;
  peek: (key: string) => void;
  /** Whether the preview of `key` has come from POB. */
  ready: (key: string) => boolean;
  detail: (key: string, pinned: boolean) => JSX.Element;
  matches: (label: string | undefined) => boolean;
  collapse: (section: number, sub: number, collapsed: boolean) => void;
};

const FOCUS = "focus-visible:ring-1 focus-visible:ring-ring";

/** A cell with a breakdown (go-pob's calcs page): one card shows its breakdown. Resting the pointer on the cell
 *  previews it beside the pointer (asked of POB as the pointer arrives, shown once it has come); pressing the cell pins
 *  that card where it is, until Escape, a press outside, its Unpin or another press on the cell. While a card is pinned
 *  no other cell previews. `class` sizes the cell in its row, `layout` lays out its content. */
function Target(props: { k: string; name: string; events: RowEvents; class?: string; layout?: string; children?: JSX.Element }) {
  const pinned = () => props.events.pinned() === props.k;
  return (
    <View
      role="button"
      focusable
      accessibilityLabel={props.name}
      accessibilityState={{ selected: pinned(), expanded: pinned() }}
      onPress={() => props.events.press(props.k)}
      class={`${WASH} hover:bg-accent/60 active:bg-accent ${FOCUS} ${props.class ?? ""}`}
      classList={{ "bg-accent": pinned() }}
    >
      <HoverCard
        class={props.layout}
        delay={300}
        disabled={props.events.pinned() !== undefined}
        onPrepare={() => props.events.peek(props.k)}
        ready={() => props.events.ready(props.k)}
        content={() => props.events.detail(props.k, pinned())}
        cardClass="w-[480px]"
        pinned={pinned()}
        onUnpin={() => props.events.unpin(props.k)}
      >
        {props.children}
      </HoverCard>
    </View>
  );
}

const rowName = (r: Row, c?: Cell) => `${tr(label(r.label))} ${label(c?.text)}`.trim();

function Chevron(props: { open: boolean }) {
  return (
    <Text
      class="w-3 text-center text-[10px] text-muted-foreground transition-transform duration-180 ease-out motion-reduce:transition-none"
      classList={{ "rotate-90": props.open }}
    >
      ▶
    </Text>
  );
}

function Narrow(props: { si: number; ui: number; sub: Sub; events: RowEvents }) {
  return (
    <View class="py-0.5">
      <Each of={statRows(props.sub)} key="index">
        {(r) => (
          <If when={props.events.matches(r().label)}>
            <If
              when={detailCell(r())}
              else={
                <View class="min-h-[18px] flex-row items-baseline gap-2 px-2 py-px">
                  <RowContent row={r()} />
                </View>
              }
            >
              {(c) => (
                <Target
                  k={targetKey({ section: props.si, sub: props.ui, row: r().row, col: c().col })}
                  name={rowName(r(), undefined)}
                  events={props.events}
                  layout="min-h-[18px] flex-row items-baseline gap-2 px-2 py-px"
                >
                  <RowContent row={r()} />
                </Target>
              )}
            </If>
          </If>
        )}
      </Each>
    </View>
  );
}

function RowContent(props: { row: Row }) {
  return (
    <>
      <PobText text={`${props.row.color ?? ""}${props.row.label ?? ""}`} class="w-34 shrink-0 text-xs text-muted-foreground" />
      {/* the values keep to the right of the label, as in POB: long text (a list of buffs) wraps there, and shows whole
          on hover when it runs over three lines */}
      <View class="min-w-0 flex-1 items-end gap-0.5">
        <Each of={props.row.cells} key="index">
          {(c) => (
            <View class="max-w-full" tooltip={c().text.length > 60 ? <PobText text={c().text} raw class="text-xs text-foreground" /> : undefined}>
              <PobText text={c().text} raw numberOfLines={3} class="text-right font-mono text-xs text-foreground" />
            </View>
          )}
        </Each>
      </View>
    </>
  );
}

// A damage type's column: at least POB's width (CalcSections colWidth 95), sharing what room is left; narrower than
// that, the table scrolls sideways.
const COL = "basis-24 grow shrink-0";

// The bar of a table that scrolls sideways: always there while it can scroll, so the table shows it can.
const SCROLLBAR = {
  mode: "always" as const,
  horizontal: { class: "absolute inset-x-1 bottom-0 h-1.5", thumbClass: "rounded-full bg-muted-foreground/40" },
};

function Wide(props: { si: number; ui: number; sub: Sub; events: RowEvents }) {
  // too narrow for every column: the table scrolls, and fades out on the right while more is to the right
  const viewport = signal(0);
  const content = signal(0);
  const offset = signal(0);
  const more = () => content() - viewport() - offset() > 2;
  return (
    <View class="relative">
      <Scroll
        horizontal
        class="pt-0.5 pb-2"
        contentClass="grow"
        scrollbar={SCROLLBAR}
        onLayout={(e) => viewport.set(e.bounds.size.width)}
        onScroll={(e) => {
          offset.set(e.offset.x);
          content.set(e.contentSize.width);
        }}
      >
        <View role="table" accessibilityLabel={tr(label(props.sub.label))} class="grow" onLayout={(e) => content.set(e.bounds.size.width)}>
          <Each of={statRows(props.sub)} key="index">
            {(r) => (
              <If
                when={isHeaderRow(r())}
                else={
                  <If when={props.events.matches(r().label)}>
                    <View role="row" class="min-h-[18px] flex-row items-baseline gap-1 px-2">
                      <PobText text={`${r().color ?? ""}${r().label ?? ""}`} class="w-34 shrink-0 py-px text-xs text-muted-foreground" />
                      <Each of={r().cells} key="index">
                        {(c) => (
                          <If
                            when={c().detail}
                            else={<PobText text={c().text} raw numberOfLines={1} class={`${COL} px-1 py-px text-right font-mono text-xs text-foreground`} />}
                          >
                            <Target
                              k={targetKey({ section: props.si, sub: props.ui, row: r().row, col: c().col })}
                              name={`${rowName(r(), undefined)}, ${tr(label(headerOf(props.sub, c().col)))}`}
                              events={props.events}
                              class={COL}
                              layout="px-1 py-px"
                            >
                              <PobText text={c().text} raw numberOfLines={1} class="text-right font-mono text-xs text-foreground" />
                            </Target>
                          </If>
                        )}
                      </Each>
                    </View>
                  </If>
                }
              >
                <View role="row" class="flex-row gap-1 px-2 pt-1">
                  <View class="w-34 shrink-0" />
                  <Each of={r().cells} key="index">
                    {(c) => (
                      <View role="columnheader" class={`${COL} px-1 pb-px`}>
                        <Text
                          class="truncate text-right text-xs font-semibold"
                          classList={{ "text-muted-foreground": !hex(c().text) }}
                          style={hex(c().text) ? { color: hex(c().text) } : undefined}
                         
                        >
                          {tr(label(c().text))}
                        </Text>
                      </View>
                    )}
                  </Each>
                </View>
              </If>
            )}
          </Each>
        </View>
      </Scroll>
      <View class={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-r from-transparent to-card ${FADE}`} classList={{ "opacity-0": !more() }} />
    </View>
  );
}

/** The column title of `col` in a wide subsection (its header row). */
export function headerOf(sub: Sub, col: number): string {
  return sub.rows.find(isHeaderRow)?.cells.find((c) => c.col === col)?.text ?? "";
}

/** A subsection's title after the first: its own fold. */
function SubTitle(props: { si: number; ui: number; sub: Sub; colour?: string; events: RowEvents }) {
  return (
    <View
      role="button"
      accessibilityLabel={tr(label(props.sub.label))}
      accessibilityState={{ expanded: !props.sub.collapsed }}
      onPress={() => props.events.collapse(props.si, props.ui, !props.sub.collapsed)}
      class={`min-h-6 flex-row items-baseline gap-1.5 border-t border-border/60 px-2 py-1 ${WASH} hover:bg-accent/60 ${FOCUS}`}
    >
      <Chevron open={!props.sub.collapsed} />
      <Text variant="caption" class="font-semibold uppercase tracking-wide" style={props.colour ? { color: props.colour } : undefined}>
        {tr(label(props.sub.label))}
      </Text>
      <If when={props.sub.extra}>
        <PobText text={props.sub.extra ?? ""} raw class="font-mono text-xs text-muted-foreground" />
      </If>
    </View>
  );
}

/** One section (`si`, 1-based as POB numbers it): its title (pressing it folds the section), then its subsections. */
export function Section(props: {
  section: SectionData;
  si: number;
  events: RowEvents;
  /** Rows as label / value whatever POB's width, and no fold (the skill selection: folding it would hide POB's
   *  controls the toolbar shows). */
  narrow?: boolean;
  title?: string;
}) {
  const first = () => props.section.subsections[0];
  const open = () => !first()?.collapsed;
  const colour = () => hex(props.section.colour);
  const title = () => props.title ?? tr(label(first()?.label));
  const Body = (p: { sub: Sub; ui: number }) => (
    <If when={props.section.cols >= 3 && !props.narrow} else={<Narrow si={props.si} ui={p.ui} sub={p.sub} events={props.events} />}>
      <Wide si={props.si} ui={p.ui} sub={p.sub} events={props.events} />
    </If>
  );
  return (
    <View
      class="overflow-hidden rounded-(--radius) border border-border bg-card"
      classList={{ "opacity-60": !props.section.enabled }}
    >
      <View
        role="button"
        accessibilityLabel={title()}
        accessibilityState={{ expanded: open(), disabled: !props.section.enabled || !!props.narrow }}
        disabled={!props.section.enabled || props.narrow}
        onPress={() => props.events.collapse(props.si, 1, open())}
        class={`min-h-7 flex-row items-baseline gap-1.5 px-2 py-1.5 ${WASH} hover:bg-accent/60 active:bg-accent ${FOCUS}`}
      >
        <If when={!props.narrow}>
          <Chevron open={open() && props.section.enabled} />
        </If>
        <Text class="truncate text-xs font-semibold uppercase tracking-wide" style={colour() ? { color: colour() } : undefined}>
          {title()}
        </Text>
        <If when={props.section.enabled && first()?.extra}>
          <PobText text={first()?.extra ?? ""} raw numberOfLines={1} class="flex-1 font-mono text-xs text-muted-foreground" />
        </If>
        <If when={!props.section.enabled}>
          <Text variant="caption" tone="muted">
            {s("notApplicable")}
          </Text>
        </If>
      </View>
      <If when={open() && props.section.enabled}>
        <View class="border-t border-border">
          <Each of={props.section.subsections} key="index">
            {(sub, i) => (
              <View>
                <If when={i() > 0}>
                  <SubTitle si={props.si} ui={i() + 1} sub={sub()} colour={colour()} events={props.events} />
                </If>
                <If when={i() === 0 || !sub().collapsed}>
                  <Body sub={sub()} ui={i() + 1} />
                </If>
              </View>
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}
