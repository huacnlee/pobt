// The Skills page of POBT's build editor: Path of Building's Skills tab (Classes/SkillsTab.lua) on POBT's controls,
// laid out as go-pob's. The active skill set's socket groups and the tab's gem options on the left, the shown group and
// its gems on the right. Every value and number is POB's own (its controls' text, its labels, its tooltips; read by
// service/skills.lua), and every change goes through the Skills tab's own controls, so POB's rules apply.
import { computed, resource, Scroll, signal, View } from "nsh";
import { Badge, Button, EmptyState, FieldRow, Panel, Select, Text } from "../../ui";
import { ListRow } from "../../ui/list-row";
import { GameArt } from "../art";
import { ColoredText, plain } from "../ColoredText";
import { language, t, tr } from "../i18n";
import { PobControl } from "../PobControl";
import { page } from "../BuildEditor";
import { build, change, type Control } from "../session";
import {
  type Attr,
  GEM_TEXT,
  type Gem,
  gemChoices,
  type Group,
  groupTitle,
  type Options,
  readSkills,
  s,
  slotTitle,
  tipOf,
} from "./skills/data";
import { PobHover } from "./skills/Tip";

/** A POB label as a field's name: its colour codes and trailing colon dropped, translated. */
const labelText = (label: string | undefined) => tr(plain(label ?? "").replace(/:\s*$/, ""));

export function SkillsPage() {
  // The group to show (1-based); POB keeps it in range and answers with the one it shows.
  const wanted = signal(1);
  // Bumped after each change: a change that needs no recalculation (an option, a label) leaves the revision as it was.
  const changes = signal(0);
  const view = resource(
    // read only while the page is shown: POB builds every gem's tooltip for it
    () => (build.open() && page() === "skills" ? { revision: build.revision(), changes: changes(), group: wanted() } : null),
    ({ group }) => readSkills(group),
  );
  const bump = () => changes.update((n) => n + 1);

  const groups = (): Group[] => view()?.groups ?? [];
  const detail = () => view()?.detail ?? null;
  const shown = () => detail()?.index ?? 0;
  const group = () => groups()[shown() - 1];
  const locked = () => !!group()?.source;
  const isMain = () => !!view() && view()!.main === shown();

  /** A change to the build through POB's Skills tab (`{ group }` added unless given), then a recalculation. */
  const edit = (op: string, args: Record<string, unknown> = {}) => change(`skills.${op}`, { group: shown(), ...args }).then(bump);

  // The gems POB's gem selectors offer for the shown group (the next gem's, and the imbued support's).
  const choices = resource(
    () => (page() === "skills" && view() && shown() && !locked() ? { revision: build.revision(), changes: changes(), group: shown() } : null),
    ({ group }) => gemChoices(group),
  );
  const imbuedChoices = resource(
    () => (page() === "skills" && detail()?.imbued.shown && detail()?.imbued.enabled ? { revision: build.revision(), group: shown() } : null),
    ({ group }) => gemChoices(group, true),
  );
  const gemItems = computed(() => {
    language();
    return (choices() ?? []).map((g) => ({
      value: g.id,
      title: tr(g.name),
      group: g.canSupport ? s("supportsThis") : g.support ? s("support") : s("active"),
    }));
  });
  const attrOf = computed(() => new Map((choices() ?? []).map((g) => [g.id, g.attr] as const)));
  // POB's English name of each gem offered: its picture is found by it (the titles are translated)
  const nameOf = computed(() => new Map((choices() ?? []).map((g) => [g.id, g.name] as const)));
  const imbuedItems = computed(() => {
    language();
    return (imbuedChoices() ?? []).map((g) => ({ value: g.id, title: tr(g.name) }));
  });
  const imbuedValue = () => (imbuedChoices() ?? []).find((g) => g.name === detail()?.imbued.text)?.id ?? null;
  const showCount = () => (detail()?.gems ?? []).some((g) => g.controls.count.shown);

  const confirming = signal(false);
  function choose(i: number) {
    confirming.set(false);
    wanted.set(i);
  }

  const setItems = () => (view()?.sets ?? []).map((title, i) => ({ value: String(i + 1), title: tr(title) }));

  return (
    <If when={build.open()} else={<EmptyState title={t("noBuild")} />}>
      <View class="flex-1 flex-row">
        {/* socket groups and gem options */}
        <View class="w-72 border-r border-border bg-card">
          <If when={(view()?.sets.length ?? 0) > 1}>
            <View class="gap-1 border-b border-border p-2">
              <Text variant="label" tone="muted">
                {tr("Skill set")}
              </Text>
              <Select
                items={setItems()}
                value={String(view()?.activeSet ?? 1)}
                accessibilityLabel={tr("Skill set")}
                onChange={(v) => {
                  if (Number(v) === view()?.activeSet) return;
                  choose(1);
                  void change("skills.setSkillSet", { index: Number(v) }).then(bump);
                }}
              />
            </View>
          </If>
          <View class="h-9 flex-row items-center gap-2 border-b border-border pl-3 pr-1.5">
            <Text variant="heading" class="flex-1 truncate">
              {s("groups")}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              label={`+ ${s("newGroup")}`}
              onPress={() => {
                confirming.set(false);
                // POB shows the new group; ask for the one past the end, which POB answers with the last
                wanted.set(groups().length + 1);
                void change("skills.newGroup").then(bump);
              }}
            />
          </View>
          <Scroll class="flex-1">
            <View class="gap-0.5 p-1.5">
              <If when={view() && groups().length === 0}>
                <Text variant="caption" tone="muted" class="p-2">
                  {s("noGroups")}
                </Text>
              </If>
              <Each of={groups().map((_, i) => i + 1)}>
                {(i) => (
                  <GroupRow
                    group={groups()[i() - 1] ?? NO_GROUP}
                    index={i()}
                    main={view()?.main === i()}
                    selected={shown() === i()}
                    onPress={() => choose(i())}
                  />
                )}
              </Each>
            </View>
          </Scroll>
          <If when={view()}>
            <GemOptions options={view()!.options} onDone={bump} />
          </If>
        </View>

        {/* the shown group */}
        <Scroll class="flex-1">
          <If when={detail() && group()} else={<EmptyState title={s("noGroup")} detail={view() && groups().length === 0 ? s("noGroups") : undefined} />}>
            <View class="max-w-3xl gap-3 p-4">
              {/* the gems first: what is changed most (go-pob's and POB's order) */}
              <Panel
                title={groupTitle(group() ?? NO_GROUP)}
                actions={
                  <Button
                    size="sm"
                    variant={isMain() ? "primary" : "secondary"}
                    label={isMain() ? `★ ${s("isMain")}` : s("setMain")}
                    disabled={isMain()}
                    onPress={() => void edit("setMain")}
                  />
                }
              >
                <View class="h-7 flex-row items-center gap-1.5 border-b border-border px-3">
                  <View class="w-5" />
                  <Text variant="label" tone="muted" class="flex-1">
                    {tr("Gem name")}
                  </Text>
                  <Text variant="label" tone="muted" class="w-16">
                    {tr("Level")}
                  </Text>
                  <Text variant="label" tone="muted" class="w-16">
                    {tr("Quality")}
                  </Text>
                  <Text variant="label" tone="muted" class="w-12 text-center">
                    {tr("Enabled")}
                  </Text>
                  <If when={showCount()}>
                    <Text variant="label" tone="muted" class="w-16">
                      {tr("Count")}
                    </Text>
                  </If>
                  <View class="w-7" />
                </View>
                <Each of={(detail()?.gems ?? []).map((_, j) => j + 1)}>
                  {(j) => (
                    <GemRow
                      gem={detail()?.gems[j() - 1] ?? NO_GEM}
                      index={j()}
                      group={shown()}
                      countColumn={showCount()}
                      locked={locked()}
                      choices={gemItems()}
                      attrOf={(id) => attrOf().get(id)}
                      nameOf={(id) => nameOf().get(id)}
                      edit={(op, args) => void edit(op, { gem: j(), ...args })}
                    />
                  )}
                </Each>
                <If when={!locked()}>
                  <View class="flex-row items-center gap-1.5 px-3 py-1.5">
                    <View class="w-5" />
                    <Select
                      class="h-7 w-72"
                      items={gemItems()}
                      value={null}
                      searchable
                      placeholder={`+ ${s("addGem")}`}
                      accessibilityLabel={s("addGem")}
                      renderItem={(item) => <GemChoiceRow value={item.value} title={item.title} name={nameOf().get(item.value)} attr={attrOf().get(item.value)} group={shown} />}
                      onChange={(id) => void edit("setGem", { id })}
                    />
                  </View>
                </If>
              </Panel>

              {/* the group's settings, after its gems and compact (POB's detail above the gems) */}
              <Panel>
                <View class="gap-1.5 px-3 py-2">
                  <Text variant="caption" tone="muted">
                    {s("settings")}
                  </Text>
                  <View class="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Inline control={detail()?.label} label="Label" class="h-7 w-56" onAct={(v) => void edit("setLabel", { text: String(v) })} />
                    <Inline control={detail()?.slot} label="Socketed in" class="h-7 w-44" onAct={(v) => void edit("setSlot", { index: v })} />
                  </View>
                  <View class="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Inline control={detail()?.enabled} label="Enabled" onAct={(v) => void edit("setEnabled", { on: v })} />
                    <Inline control={detail()?.includeInFullDPS} label="Include in Full DPS" onAct={(v) => void edit("setFullDPS", { on: v })} />
                    <Inline control={detail()?.count} label="Count" class="h-7 w-16" onAct={(v) => void edit("setGroupCount", { value: String(v) })} />
                  </View>
                  <If when={detail()?.sockets.shown}>
                    <View class="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
                      <ColoredText text={detail()?.sockets.label ?? ""} class="text-xs" />
                      <If when={detail()?.optimiseSockets.shown}>
                        <PobHover id={() => `optimise|${shown()}`} load={() => tipOf({ what: "optimiseSockets", group: shown() })}>
                          <Button
                            size="sm"
                            variant="secondary"
                            label={tr(detail()?.optimiseSockets.label)}
                            disabled={!detail()?.optimiseSockets.enabled}
                            onPress={() => void edit("optimiseSockets")}
                          />
                        </PobHover>
                      </If>
                    </View>
                  </If>
                  <If when={detail()?.imbuedLabel.shown}>
                    <View class="flex-row items-center gap-1.5">
                      <Text variant="caption" tone="muted">
                        {labelText(detail()?.imbuedLabel.label)}
                      </Text>
                      <If
                        when={detail()?.imbued.enabled}
                        else={
                          <Text tone="muted" class="w-56 px-2.5 text-xs">
                            {tr(detail()?.imbued.text) || s("imbuedNone")}
                          </Text>
                        }
                      >
                        <Select
                          class="h-7 w-56"
                          items={imbuedItems()}
                          value={imbuedValue()}
                          searchable
                          placeholder={s("imbuedNone")}
                          accessibilityLabel={labelText(detail()?.imbuedLabel.label)}
                          onChange={(id) => id !== imbuedValue() && void edit("setImbued", { id })}
                        />
                      </If>
                      <PobHover id={() => `imbuedClear|${shown()}`} load={() => tipOf({ what: "imbuedClear", group: shown() })}>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="w-7 px-0"
                          label="✕"
                          accessibilityLabel={labelText(detail()?.imbuedLabel.label)}
                          disabled={!detail()?.imbuedClear.enabled || !detail()?.imbued.text}
                          onPress={() => void edit("clearImbued")}
                        />
                      </PobHover>
                    </View>
                  </If>
                  <If when={detail()?.sourceNote.shown}>
                    <View>
                      <Each of={(detail()?.sourceNote.label ?? "").split("\n")}>
                        {(line) => <ColoredText text={line().replace(/\t/g, "    ")} class="text-xs leading-tight" />}
                      </Each>
                    </View>
                  </If>
                  <If when={!locked()}>
                    <View class="flex-row items-center justify-end gap-2">
                      <If when={confirming()}>
                        <Button variant="ghost" size="sm" label={tr("Cancel")} onPress={() => confirming.set(false)} />
                      </If>
                      <Button
                        variant="destructive"
                        size="sm"
                        label={confirming() ? s("confirmDelete") : s("deleteGroup")}
                        onPress={() => {
                          if (!confirming()) {
                            confirming.set(true);
                            return;
                          }
                          const i = shown();
                          confirming.set(false);
                          wanted.set(Math.max(1, i - 1));
                          void edit("deleteGroup", { group: i });
                        }}
                      />
                    </View>
                  </If>
                </View>
              </Panel>
            </View>
          </If>
        </Scroll>
      </View>
    </If>
  );
}

const NO_CONTROL: Control = { shown: false, enabled: false, kind: "other" };
const NO_GROUP: Group = { label: "", displayLabel: "", enabled: true, slotEnabled: true, includeInFullDPS: false, count: 0 };
const NO_GEM: Gem = {
  name: "",
  attr: "white",
  known: false,
  enabled: true,
  support: false,
  controls: {
    level: NO_CONTROL,
    quality: NO_CONTROL,
    enabled: NO_CONTROL,
    count: NO_CONTROL,
    enableGlobal1: NO_CONTROL,
    enableGlobal2: NO_CONTROL,
    delete: NO_CONTROL,
  },
};

/** What a control POB does not let change shows: a list's choice, an edit box's text, a check box's state. */
function controlText(c: Control | undefined): string {
  if (!c) return "";
  if (c.kind === "list") return tr(plain(c.items?.[(c.sel ?? 1) - 1] ?? ""));
  if (c.kind === "check") return c.checked ? "✓" : "—";
  return c.text ?? "";
}

/** A gem's picture in a box of fixed size, so a row keeps its height and nothing moves when the picture arrives (or
 * when there is none). */
function GemIcon(props: { name: string | undefined; size: number }) {
  return (
    <View class="shrink-0 items-center justify-center" style={{ width: props.size, height: props.size }}>
      <If when={props.name}>
        <GameArt name={props.name ?? ""} size={props.size} />
      </If>
    </View>
  );
}

/** A gem in a gem selector's list, in its attribute's colour, with what POB's selector shows on hover: the gem's
 * tooltip and what choosing it would change (GemSelectControl:Draw). `gem` is the slot replaced, none for a new gem. */
function GemChoiceRow(props: { value: string; title: string; name: string | undefined; attr: Attr | undefined; group: () => number; gem?: () => number }) {
  return (
    <PobHover
      class="flex-1 flex-row items-center gap-2"
      center
      id={() => `choice|${props.group()}|${props.gem?.() ?? "new"}|${props.value}`}
      load={() => tipOf({ what: "choice", group: props.group(), gem: props.gem?.(), id: props.value })}
    >
      <GemIcon name={props.name} size={20} />
      <Text class={`truncate text-sm ${GEM_TEXT[props.attr ?? "white"]}`}>{props.title}</Text>
    </PobHover>
  );
}

/** A control of POB's Skills tab inline, several to a row: a check box before its label, any other after it. */
function Inline(props: { control: Control | undefined; label: string; class?: string; onAct: (value: number | string | boolean) => void }) {
  const field = () => (
    <If when={props.control?.enabled} else={<Text class="text-sm">{controlText(props.control)}</Text>}>
      <PobControl control={props.control} path={[]} label={tr(props.label)} class={props.class} onAct={props.onAct} />
    </If>
  );
  return (
    <If when={props.control?.shown}>
      <View class="flex-row items-center gap-1.5">
        <If
          when={props.control?.kind === "check"}
          else={
            <>
              <Text variant="caption" tone="muted">
                {tr(props.label)}
              </Text>
              {field()}
            </>
          }
        >
          {field()}
          <Text class="text-sm">{tr(props.label)}</Text>
        </If>
      </View>
    </If>
  );
}

/** The tab's "Gem Options": how new gems are levelled and which the gem lists offer. */
function GemOptions(props: { options: Options; onDone: () => void }) {
  const row = (name: string, c: () => Control, cls?: string) => (
    <If when={c().shown}>
      <FieldRow label={labelText(c().label)}>
        <PobControl
          control={c()}
          path={["skillsTab", "controls", name]}
          label={labelText(c().label)}
          class={cls}
          onAct={(value) => void change("skills.setOption", { name, value }).then(props.onDone)}
        />
      </FieldRow>
    </If>
  );
  return (
    <View class="gap-0.5 border-t border-border px-3 py-2">
      <Text variant="heading" class="py-1">
        {tr("Gem Options")}
      </Text>
      {row("sortGemsByDPS", () => props.options.sortGemsByDPS)}
      {row("sortGemsByDPSFieldControl", () => props.options.sortGemsByDPSField, "w-32")}
      {row("defaultLevel", () => props.options.defaultLevel, "w-32")}
      {row("defaultQuality", () => props.options.defaultQuality, "w-16")}
      {row("showSupportGemTypes", () => props.options.showSupportGemTypes, "w-32")}
      {row("showLegacyGems", () => props.options.showLegacyGems)}
    </View>
  );
}

/** A socket group in the list: main marker, name, slot, its states; POB's group tooltip on hover. */
function GroupRow(props: { group: Group; index: number; main: boolean; selected: boolean; onPress: () => void }) {
  const title = () => groupTitle(props.group);
  const where = () => (props.group.slot ? slotTitle(props.group.slot) : "");
  const off = () => !props.group.enabled || !props.group.slotEnabled;
  return (
    <PobHover id={() => `group|${props.index}`} load={() => tipOf({ what: "group", group: props.index })}>
      <ListRow
        selected={props.selected}
        onPress={props.onPress}
        accessibilityLabel={title()}
        accessibilityHint={[props.main ? s("isMain") : "", off() ? s("disabled") : "", where()].filter(Boolean).join(", ")}
        class="py-1"
      >
        <GemIcon name={props.group.activeGem} size={24} />
        <View class="w-3 items-center">
          <If when={props.main}>
            <Text variant="label" tone="primary">
              ★
            </Text>
          </If>
        </View>
        <View class="flex-1 gap-0.5" classList={{ "opacity-50": off() }}>
          <Text class="truncate" tone={props.main ? "primary" : "default"}>
            {title()}
          </Text>
          <If when={where() || off()}>
            <Text variant="caption" tone="muted" class="truncate">
              {[where(), off() ? s("disabled") : ""].filter(Boolean).join(" · ")}
            </Text>
          </If>
        </View>
        <If when={props.group.includeInFullDPS}>
          <Badge label={s("fullDps")} />
        </If>
      </ListRow>
    </PobHover>
  );
}

/** One of a gem's numbers: POB's edit box, or its text where POB does not let it change. */
function GemNumber(props: { control: Control; label: string; onAct: (v: string) => void; tip?: () => Promise<import("./skills/data").TipLine[]>; tipId?: () => string }) {
  const field = (
    <If
      when={props.control.enabled && props.control.shown}
      else={
        <Text variant="mono" class="w-16 px-2.5">
          {props.control.text ?? ""}
        </Text>
      }
    >
      <PobControl control={props.control} path={[]} label={props.label} class="h-7 w-16" onAct={(v) => props.onAct(String(v))} />
    </If>
  );
  return props.tip ? (
    <PobHover id={props.tipId} load={props.tip}>
      {field}
    </PobHover>
  ) : (
    field
  );
}

/** A gem of the shown group, as POB's gem row: name in its attribute's colour (POB's gem tooltip), level, quality,
 * enabled, count, a Vaal gem's skill switches, POB's error, remove. */
function GemRow(props: {
  gem: Gem;
  index: number;
  group: number;
  countColumn: boolean;
  locked: boolean;
  /** What POB's gem selector offers in this group (skills.gems), for replacing the gem. */
  choices: { value: string; title: string; group?: string }[];
  attrOf: (id: string) => Attr | undefined;
  nameOf: (id: string) => string | undefined;
  edit: (op: string, args: Record<string, unknown>) => void;
}) {
  const c = () => props.gem.controls;
  const name = () => tr(props.gem.name);
  const tip = (what: string) => () => tipOf({ what, group: props.group, gem: props.index });
  const tipId = (what: string) => () => `${what}|${props.group}|${props.index}`;
  return (
    <View class="border-b border-border px-3">
      <View class="h-8 flex-row items-center gap-1.5" classList={{ "opacity-50": !props.gem.enabled }}>
        <PobHover
          class="flex-1 flex-row items-center gap-1.5"
          center
          lines={() => (props.gem.tip?.length ? props.gem.tip : [{ text: props.gem.known ? props.gem.name : s("unknownGem") }])}
        >
          <GemIcon name={props.gem.name || undefined} size={20} />
          {/* POB's gem selector (GemSelectControl): choosing another gem replaces this one */}
          <If
            when={!props.locked}
            else={<Text class={`truncate ${props.gem.known ? GEM_TEXT[props.gem.attr] : "text-destructive"}`}>{name()}</Text>}
          >
            <Select
              class="h-7 flex-1"
              items={props.choices}
              value={props.gem.id ?? null}
              searchable
              placeholder={name()}
              accessibilityLabel={`${tr("Gem name")}: ${name()}`}
              triggerContent={<Text class={`truncate text-sm ${props.gem.known ? GEM_TEXT[props.gem.attr] : "text-destructive"}`}>{name()}</Text>}
              renderItem={(item) => (
                <GemChoiceRow
                  value={item.value}
                  title={item.title}
                  name={props.nameOf(item.value)}
                  attr={props.attrOf(item.value)}
                  group={() => props.group}
                  gem={() => props.index}
                />
              )}
              onChange={(id) => id !== props.gem.id && props.edit("setGem", { id })}
            />
          </If>
        </PobHover>
        <GemNumber control={c().level} label={`${name()} ${tr("Level")}`} onAct={(v) => props.edit("setGemLevel", { value: v })} />
        <GemNumber
          control={c().quality}
          label={`${name()} ${tr("Quality")}`}
          onAct={(v) => props.edit("setGemQuality", { value: v })}
          tip={tip("quality")}
          tipId={tipId("quality")}
        />
        <PobHover class="w-12 items-center" id={tipId("enabled")} load={tip("enabled")}>
          <PobControl
            control={c().enabled}
            path={[]}
            label={`${name()} ${tr("Enabled")}`}
            onAct={(v) => props.edit("setGemEnabled", { value: v })}
          />
        </PobHover>
        <If when={props.countColumn}>
          <View class="w-16">
            <If when={c().count.shown}>
              <GemNumber
                control={c().count}
                label={`${name()} ${tr("Count")}`}
                onAct={(v) => props.edit("setGemCount", { value: v })}
                tip={tip("count")}
                tipId={tipId("count")}
              />
            </If>
          </View>
        </If>
        <PobHover class="w-7" id={tipId("delete")} load={tip("delete")}>
          <If when={c().delete.shown}>
            <Button
              variant="ghost"
              size="sm"
              class="w-7 px-0"
              label="✕"
              accessibilityLabel={`${s("removeGem")}: ${name()}`}
              disabled={!c().delete.enabled}
              onPress={() => props.edit("removeGem", {})}
            />
          </If>
        </PobHover>
      </View>
      <If when={c().enableGlobal1.shown || c().enableGlobal2.shown}>
        <View class="flex-row flex-wrap gap-x-4 pb-1 pl-7">
          <GlobalSwitch control={c().enableGlobal1} onAct={(v) => props.edit("setGemGlobal", { which: 1, value: v })} />
          <GlobalSwitch control={c().enableGlobal2} onAct={(v) => props.edit("setGemGlobal", { which: 2, value: v })} />
        </View>
      </If>
      <If when={props.gem.errMsg}>
        <ColoredText text={`^1${props.gem.errMsg ?? ""}`} class="pb-1 pl-7 text-xs" />
      </If>
    </View>
  );
}

/** A Vaal gem's "Enable <skill>:" check box, with POB's label. */
function GlobalSwitch(props: { control: Control; onAct: (v: boolean) => void }) {
  return (
    <If when={props.control.shown}>
      <View class="flex-row items-center gap-1.5">
        <Text class="text-xs" tone="muted">
          {labelText(props.control.label)}
        </Text>
        <PobControl control={props.control} path={[]} label={labelText(props.control.label)} onAct={(v) => props.onAct(!!v)} />
      </View>
    </If>
  );
}
