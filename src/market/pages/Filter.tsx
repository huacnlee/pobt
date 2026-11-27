// The loot filter: the game's stage (or a threshold of one's own), made on this device from the market's prices.
// One press writes it into the game's filter folder; after that each update that brings new prices writes it again.
import { resource, signal, Text, View } from "nsh";
import { engine } from "../data/engine";
import { type FilterChoice, fileName, filterFolder, installed, installFilter, ruleCounts, soundFiles, type Stage, STAGES } from "../data/filter";
import { t } from "../data/i18n";
import { settings } from "../data/local";
import { errorText } from "../data/ninja";
import { ago, trim } from "../ui/format";
import { Page } from "../ui/Page";
import { Button, Icon, Field, Input, Select, Slider, Card, Section, Segmented, toast } from "../../ui";

type Mode = Stage | "custom";

/** The tiers by worth, best first (core/filter.ts): what each looks like in the game. */
const TIERS = [
  { at: "≥ 1 div", key: "filter.tier1" },
  { at: "≥ 20 c", key: "filter.tier2" },
  { at: "≥ 5 c", key: "filter.tier3" },
  { at: "threshold", key: "filter.tier4" },
  { at: "under", key: "filter.tier5" },
];

function modeOf(choice: FilterChoice | undefined): Mode {
  return choice && "stage" in choice ? choice.stage : choice ? "custom" : "maps";
}

/** The alert sounds: the game's, or files the player already has in the filter folder, one a tier. */
function Sounds() {
  const files = resource(() => [settings().filterFolder] as const, () => soundFiles());
  const mode = () => settings().filterSound ?? "game";
  const sounds = () => settings().filterSounds ?? ["", "", ""];
  const setSound = (i: number, path: string) =>
    settings.update((s) => {
      const next = [...(s.filterSounds ?? ["", "", ""])] as [string, string, string];
      next[i] = path;
      return { ...s, filterSounds: next };
    });
  return (
    <View class="max-w-2xl gap-4">
      <Segmented
        label={t("filter.sound")}
        value={mode()}
        onChange={(m) => settings.update((s) => ({ ...s, filterSound: m }))}
        items={[
          { value: "game" as const, label: t("filter.soundGame") },
          { value: "custom" as const, label: t("filter.soundCustom") },
        ]}
      />
      <If when={mode() === "custom"}>
        <Text class="text-sm text-muted-foreground">{t("filter.soundHint")}</Text>
        <If when={files()?.length} else={<Text class="text-sm text-warning">{files() ? t("filter.soundNone") : t("common.loading")}</Text>}>
          <Card class="gap-3">
            <Each of={[0, 1, 2]} key="index">
              {(i) => (
                <View class="flex-row items-center gap-3">
                  <Text class="w-24 text-sm tabular-nums text-foreground">{t(`filter.soundTier${i() + 1}`)}</Text>
                  <Select
                    label={t(`filter.soundTier${i() + 1}`)}
                    value={sounds()[i()]}
                    onChange={(v) => setSound(i(), v)}
                    class="flex-1"
                    options={[{ value: "", title: t("filter.soundKeep") }, ...(files() ?? []).map((f) => ({ value: f, title: f }))]}
                  />
                </View>
              )}
            </Each>
            <If when={files()?.length}>
              <Text class="text-xs text-muted-foreground">{t("filter.soundsFound", { n: files()!.length })}</Text>
            </If>
          </Card>
        </If>
      </If>
    </View>
  );
}

export function Filter() {
  const mode = signal<Mode>(modeOf(installed()?.choice));
  const custom = signal(installed()?.choice && "minWorth" in installed()!.choice ? (installed()!.choice as { minWorth: number }).minWorth : 2);
  const busy = signal(false);
  // Each stage's filter is made from the market's prices, again when an update brings new ones.
  const counts = resource(engine.version, () => ruleCounts());
  const folder = resource(() => [settings().filterFolder] as const, () => filterFolder());
  const choice = (): FilterChoice => (mode() === "custom" ? { minWorth: custom() } : { stage: mode() as Stage });
  const threshold = () => (mode() === "custom" ? custom() : STAGES.find((s) => s.value === mode())!.minWorth);
  const rules = () => (mode() === "custom" ? undefined : counts()?.get(mode() as Stage));
  const isInstalled = () => {
    const now = installed();
    return !!now && fileName(now.choice) === fileName(choice());
  };
  const act = async () => {
    busy.set(true);
    try {
      toast(t("filter.installed", { path: await installFilter(choice()) }));
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      busy.set(false);
    }
  };
  const tierLabel = (at: string) =>
    at === "threshold"
      ? t("filter.atLeast", { value: `${trim(threshold())} c` })
      : at === "under"
        ? t("filter.under", { value: `${trim(threshold())} c` })
        : at;
  return (
    <Page
      title={t("filter.title")}
      subtitle={engine.meta() ? t("filter.subtitle", { league: engine.meta()!.league, ago: ago(engine.meta()!.at) }) : t("common.loading")}
      testID="page-filter"
    >
      <Text class="max-w-2xl text-sm text-muted-foreground">{t("filter.intro")}</Text>
      <Section title={t("filter.stage")}>
        <View class="gap-4">
          <Segmented
            label={t("filter.stage")}
            value={mode()}
            onChange={(m) => mode.set(m)}
            items={[...STAGES.map((s) => ({ value: s.value as Mode, label: t(`filter.${s.value}`) })), { value: "custom", label: t("filter.custom") }]}
          />
          <If
            when={mode() === "custom"}
            else={
              <Text class="max-w-2xl text-sm text-muted-foreground">
                {`${t(`filter.${mode()}Hint`)}${rules() ? ` · ${t("filter.rules", { n: rules() })}` : ""}`}
              </Text>
            }
          >
            <View class="max-w-md gap-2">
              <View class="flex-row justify-between">
                <Text class="text-sm text-foreground">{t("filter.hideBelow")}</Text>
                <Text class="text-sm font-semibold tabular-nums text-foreground">{`${trim(custom())} c`}</Text>
              </View>
              <Slider
                value={custom()}
                onChange={(v) => custom.set(Number(v.toFixed(v < 1 ? 1 : 0)))}
                min={0.1}
                max={50}
                logarithmic
                label={t("filter.threshold")}
                testID="min-worth"
              />
            </View>
          </If>
        </View>
      </Section>
      <Section title={t("filter.tiers")}>
        <Card class="gap-2 p-3">
          <Each of={TIERS} key="index">
            {(tier) => (
              <View class="flex-row items-center gap-3">
                <Text class="w-20 text-sm tabular-nums text-foreground">{tierLabel(tier().at)}</Text>
                <Text class="text-sm text-muted-foreground">{t(tier().key)}</Text>
              </View>
            )}
          </Each>
        </Card>
      </Section>
      <Section title={t("filter.sound")}>
        <Sounds />
      </Section>
      <Section title={t("filter.install")}>
        <View class="max-w-2xl gap-4">
          <Field label={t("filter.folder")} hint={settings().filterFolder ? t("filter.folderCustom") : t("filter.folderDefault")}>
            <Input
              value={settings().filterFolder}
              onChange={(v) => settings.update((s) => ({ ...s, filterFolder: v }))}
              placeholder={folder() ?? ""}
              icon="folder-open"
              accessibilityLabel={t("filter.folder")}
            />
          </Field>
          <View class="flex-row items-center gap-3">
            <Button
              label={t("filter.install")}
              icon="download"
              variant="primary"
              busy={busy()}
              onPress={act}
              testID="install"
            />
            <Text class="text-sm text-muted-foreground">{fileName(choice())}</Text>
          </View>
          <Card class="flex-row items-start gap-3 bg-muted/40">
            <Icon name={isInstalled() ? "circle-check" : "info"} tone={isInstalled() ? "primary" : "muted"} />
            <View class="flex-1 gap-1">
              <Text class="text-sm font-semibold text-foreground">{isInstalled() ? t("filter.autoUpdate") : t("filter.then")}</Text>
              <Text class="text-sm text-muted-foreground">
                {isInstalled()
                  ? t("filter.autoUpdateHint", { name: fileName(choice()).replace(".filter", "") })
                  : t("filter.thenDesktop", { name: fileName(choice()).replace(".filter", "") })}
              </Text>
            </View>
          </Card>
        </View>
      </Section>
      <If when={counts.error()}>
        <Text class="text-sm text-destructive">{errorText(counts.error())}</Text>
      </If>
    </Page>
  );
}
