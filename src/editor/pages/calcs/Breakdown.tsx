// The Calcs page's breakdown card (shown beside a cell, as go-pob does): how the value of the cell pointed at (or pinned) is made, exactly as POB's
// CalcBreakdownControl lists it (Classes/CalcBreakdownControl.lua): its calculation lines, its tables (sources,
// reservations, damage types, armour slots) and the modifiers summed into it.
import { Scroll, View } from "nsh";
import { Badge, Button, FADE, Hint, Text } from "../../../ui";
import { TipLines } from "../../PobTip";
import { tr } from "../../i18n";
import type { Part, TableRow } from "./data";
import { PobText } from "./PobText";
import { s } from "./strings";

// Numbers stay as POB writes them; words are translated run by run.
const NUMERIC = new Set(["displayValue", "base", "inc", "more", "total", "mult", "efficiency", "efficiencyMore", "convSrc", "convDst", "gainDst"]);
const WIDE = new Set(["name", "sourceName", "sourceLabel", "skillName", "tags", "label"]);
const width = (key: string) => (NUMERIC.has(key) ? "w-20" : WIDE.has(key) ? "w-44" : "w-24");

function Table(props: { part: Extract<Part, { type: "TABLE" }> }) {
  const cell = (r: TableRow, key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  return (
    <View class="gap-1">
      <If when={props.part.label}>
        <Text variant="label" tone="muted" class="uppercase tracking-wide">
          {tr(props.part.label)}
        </Text>
      </If>
      <Scroll horizontal>
        <View role="table" accessibilityLabel={tr(props.part.label) || s("breakdown")}>
          <View role="row" class="flex-row gap-2 border-b border-border pb-0.5">
            <Each of={props.part.columns} key="index">
              {(c) => (
                <View role="columnheader" class={`${width(c().key)} shrink-0`}>
                  <Text class="truncate" variant="caption" tone="muted" classList={{ "text-right": !!c().right }}>
                    {tr(c().label)}
                  </Text>
                </View>
              )}
            </Each>
          </View>
          <Each of={props.part.rows} key="index">
            {(r, i) => (
              <View role="row" class="flex-row gap-2 py-0.5" classList={{ "bg-muted/60": i() % 2 === 1 }}>
                <Each of={props.part.columns} key="index">
                  {(c) => (
                    <View
                      role="cell"
                      class={`${width(c().key)} shrink-0`}
                      tooltip={c().key === "source" && r().tip?.length ? <Hint><TipLines lines={r().tip ?? []} /></Hint> : undefined}
                    >
                      <PobText
                        text={cell(r(), c().key)}
                        raw={NUMERIC.has(c().key)}
                        numberOfLines={2}
                        class={`text-xs text-foreground ${NUMERIC.has(c().key) ? "font-mono" : ""} ${c().right ? "text-right" : ""}`}
                      />
                    </View>
                  )}
                </Each>
              </View>
            )}
          </Each>
        </View>
      </Scroll>
      <If when={props.part.more}>
        <Text variant="caption" tone="muted">
          {s("moreSources", props.part.more ?? 0)}
        </Text>
      </If>
      <If when={props.part.footer}>
        <PobText text={props.part.footer ?? ""} class="text-xs text-muted-foreground" />
      </If>
    </View>
  );
}

function PartView(props: { part: Part }) {
  return (
    <View class="gap-1 rounded-(--radius) border border-border/60 bg-muted/40 px-2.5 py-2">
      <If when={props.part.type === "TEXT"}>
        <View class="gap-0.5">
          <Each of={props.part.type === "TEXT" ? props.part.lines : []} key="index">
            {(line) => <PobText text={line()} class="font-mono text-xs text-foreground" />}
          </Each>
        </View>
      </If>
      <If when={props.part.type === "RADIUS"}>
        <Text variant="mono">
          {tr("Radius")}: {props.part.type === "RADIUS" ? String(props.part.radius) : ""}
        </Text>
      </If>
      <If when={props.part.type === "TABLE"}>
        <Table part={props.part as Extract<Part, { type: "TABLE" }>} />
      </If>
    </View>
  );
}

/** The breakdown of a cell, as a card beside it: a preview while pointed at, or `pinned` (with its Unpin) once pressed. */
export function BreakdownCard(props: {
  title?: { section?: string; row: string };
  parts: Part[];
  loading: boolean;
  pinned: boolean;
  onUnpin: () => void;
  /** Its own side padding (off in a hover card, which pads its content). */
  inset?: boolean;
}) {
  const pad = () => (props.inset === false ? "" : "px-3");
  return (
    <View role="region" accessibilityLabel={props.title?.row ?? s("breakdown")} class="max-h-[560px]">
      <View class={`min-h-10 flex-row items-center gap-2 border-b border-border py-1.5 ${pad()}`}>
        <View class="flex-1 gap-0.5">
          <If when={props.title?.section}>
            <Text variant="caption" tone="muted" class="truncate uppercase tracking-wide">
              {props.title?.section ?? ""}
            </Text>
          </If>
          <Text variant="heading" role="header" accessibilityLevel={2}>
            {props.title?.row ?? s("breakdown")}
          </Text>
        </View>
        <If when={props.pinned} else={<Badge label={s("preview")} />}>
          <Button size="sm" variant="ghost" label={s("unpin")} onPress={props.onUnpin} />
        </If>
      </View>
      <Scroll class="shrink" contentClass={`gap-2 py-2.5 ${pad()} ${FADE}`}>
        <If when={props.loading && !props.parts.length}>
          <Text variant="caption" tone="muted">
            {s("loading")}
          </Text>
        </If>
        <If when={!props.loading && !props.parts.length}>
          <Text variant="caption" tone="muted">
            {s("noBreakdown")}
          </Text>
        </If>
        <Each of={props.parts} key="index">
          {(p) => <PartView part={p()} />}
        </Each>
        <If when={!props.pinned}>
          <Text variant="caption" tone="muted">
            {s("hint")}
          </Text>
        </If>
      </Scroll>
    </View>
  );
}
