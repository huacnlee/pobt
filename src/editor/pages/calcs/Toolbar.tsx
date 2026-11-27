// The Calcs page's controls: POB's own Calcs tab controls (CalcsTab.lua "View Skill Details": the socket group, skill,
// part, stages, mines, minion and minion skill the page calculates apart from the sidebar's main skill, and the
// calculation mode), acted on as the user would act on them in POB; then the page's own search and "show all".
import { type JSX, View } from "nsh";
import { Checkbox, Text, Input } from "../../../ui";
import { tr } from "../../i18n";
import { PobControl } from "../../PobControl";
import type { CalcControl, SectionData } from "./data";
import { label } from "./data";
import { s } from "./strings";

function Field(props: { label: string; tooltip?: string; children?: JSX.Element }) {
  return (
    <View class="gap-1" tooltip={props.tooltip ? <Text variant="caption">{props.tooltip}</Text> : undefined}>
      <Text variant="caption" tone="muted">
        {props.label}
      </Text>
      {props.children}
    </View>
  );
}

type Entry = { label: string; control: CalcControl };

/** The skill selection section's controls that POB shows now, by their row's label. */
function entries(section: SectionData | undefined): Entry[] {
  const out: Entry[] = [];
  for (const sub of section?.subsections ?? [])
    for (const r of sub.rows)
      for (const c of r.controls ?? [])
        if (c.shown && (c.kind !== "other" || c.name === "showMinion")) out.push({ label: label(r.label), control: c });
  return out;
}

const WIDTH: Record<string, string> = {
  mainSocketGroup: "w-56",
  mainSkill: "w-48",
  mainSkillPart: "w-44",
  mainSkillMinion: "w-40",
  mainSkillMinionSkill: "w-44",
  mode: "w-32",
  mainSkillStageCount: "w-16",
  mainSkillMineCount: "w-16",
};

export function Toolbar(props: {
  select: SectionData | undefined;
  showMinion: boolean;
  onShowMinion: (on: boolean) => void;
  query: string;
  onQuery: (q: string) => void;
  showAll: boolean;
  onShowAll: (on: boolean) => void;
}) {
  return (
    <View class="flex-row flex-wrap items-end gap-x-3 gap-y-2 border-b border-border px-3 py-2">
      <Each of={entries(props.select)} key="index">
        {(e) => (
          <If
            when={e().control.name === "showMinion"}
            else={
              <Field label={tr(e().label)} tooltip={e().control.tooltip}>
                <PobControl control={e().control} path={e().control.path} label={tr(e().label)} class={WIDTH[e().control.name] ?? "w-40"} />
              </Field>
            }
          >
            <View class="h-8 justify-center self-end">
              <Checkbox checked={props.showMinion} onChange={props.onShowMinion} label={tr(e().label)} />
            </View>
          </If>
        )}
      </Each>
      <View class="flex-1" />
      <View class="h-8 justify-center self-end">
        <Checkbox checked={props.showAll} onChange={props.onShowAll} label={s("showAll")} />
      </View>
      <Input class="w-48 self-end" value={props.query} onChange={props.onQuery} placeholder={s("search")} accessibilityLabel={s("search")} />
    </View>
  );
}
