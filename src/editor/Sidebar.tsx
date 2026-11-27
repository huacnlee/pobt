// The build's sidebar as Path of Building fills it: the main skill controls and POB's own stat list (its labels,
// values and colours), translated.
import { Scroll, View } from "nsh";
import { Separator, Text } from "../ui";
import { ColoredText, plain } from "./ColoredText";
import { t, tr } from "./i18n";
import { PobControl } from "./PobControl";
import { build, type SidebarData } from "./session";

const CONTROLS: { key: keyof SidebarData; label: string }[] = [
  { key: "mainSocketGroup", label: "Main Skill" },
  { key: "mainSkill", label: "Active Skill" },
  { key: "mainSkillPart", label: "Skill Part" },
  { key: "mainSkillStageCount", label: "Stages" },
  { key: "mainSkillMineCount", label: "Active Mines" },
  { key: "mainSkillMinion", label: "Minion" },
  { key: "mainSkillMinionSkill", label: "Minion Skill" },
];

export function Sidebar() {
  const s = () => build.sidebar();
  return (
    <View class="w-75 border-r border-border bg-sidebar">
      <View class="gap-1.5 p-3">
        <Text variant="label" tone="muted">
          {tr("Main Skill")}
        </Text>
        <Each of={CONTROLS} key={(c) => c.key}>
          {(c) => {
            const ctl = () => s()?.[c().key] as SidebarData["mainSkill"];
            return (
              <View class="flex-row items-center gap-2">
                <If when={c().key === "mainSkillStageCount" || c().key === "mainSkillMineCount"}>
                  <If when={ctl()?.shown}>
                    <Text variant="caption" tone="muted" class="w-24">
                      {tr(c().label)}
                    </Text>
                  </If>
                </If>
                <PobControl control={ctl()} path={["controls", c().key]} label={tr(c().label)} class="flex-1" />
              </View>
            );
          }}
        </Each>
      </View>
      <Separator />
      <Scroll class="flex-1" scrollbar>
        <View class="py-2">
          <Each of={s()?.lines ?? []}>
            {(line) =>
              !line().left && !line().right ? (
                <View class="h-2.5" />
              ) : line().center || !line().right ? (
                <ColoredText text={line().left ?? ""} class="px-3 text-center text-xs" />
              ) : (
                <View class="min-h-5 flex-row items-baseline gap-2 px-3">
                  <ColoredText text={tr(line().left ?? "").replace(/[:：]\s*$/, "")} raw class="flex-1 text-xs truncate" />
                  <ColoredText text={line().right ?? ""} raw class="font-mono text-xs" />
                </View>
              )
            }
          </Each>
          <If when={(s()?.warnings.length ?? 0) > 0}>
            <View class="m-3 gap-1 rounded-(--radius) border border-warning/40 bg-warning/10 p-2">
              <Text variant="label" tone="warning">
                {t("warnings")}
              </Text>
              <Each of={s()?.warnings ?? []}>
                {(w) => (
                  <Text variant="caption" tone="warning">
                    {tr(plain(w()))}
                  </Text>
                )}
              </Each>
            </View>
          </If>
        </View>
      </Scroll>
    </View>
  );
}
