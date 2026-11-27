// The market's settings: how often alerts are checked, notifications, and the market's data kept on this device (how
// old, updating it now, where it is, clearing it). Its language is POBT's, chosen on the launcher.
import { t } from "../data/i18n";
import { type JSX, resource, signal, Text, View } from "nsh";
import { askNotifications, startAlerts } from "../data/alerts";
import { cacheLocation, cacheSize, checkedAt, clearCache, clearData, dataLocation, engine, nextUpdateAt, REFRESH_MINUTES, updateNow } from "../data/engine";
import { leagues } from "../data/history";
import { settings } from "../data/local";
import { ago, bytes, day } from "../ui/format";
import { Page } from "../ui/Page";
import { Button, confirm, Select, Card, Section, Separator, toast } from "../../ui";

/** One setting: its name and what it does on the left, its control on the right. */
function Setting(props: { title: string; hint: string; children: JSX.Element }) {
  return (
    <View class="flex-row items-center justify-between gap-4">
      <View class="flex-1 gap-0.5">
        <Text class="text-sm text-foreground">{props.title}</Text>
        <Text class="text-xs text-muted-foreground">{props.hint}</Text>
      </View>
      {props.children}
    </View>
  );
}

function General() {
  return (
    <Card class="gap-5">
      <Setting title={t("settings.interval")} hint={t("settings.intervalHint")}>
        <Select
          label={t("settings.interval")}
          value={String(settings().refreshMinutes)}
          onChange={(v) => {
            settings.update((s) => ({ ...s, refreshMinutes: Number(v) }));
            startAlerts();
          }}
          class="w-32"
          options={[
            { value: "5", title: t("settings.minutes", { n: 5 }) },
            { value: "10", title: t("settings.minutes", { n: 10 }) },
            { value: "30", title: t("settings.minutes", { n: 30 }) },
            { value: "60", title: t("settings.hour") },
          ]}
        />
      </Setting>
      <Separator />
      <Setting title={t("settings.notifications")} hint={t("settings.notificationsHint")}>
        <Button
          label={t("settings.allow")}
          icon="bell"
          size="sm"
          variant="outline"
          onPress={async () => toast((await askNotifications()) ? t("settings.allowed") : t("settings.denied"), "info")}
        />
      </Setting>
    </Card>
  );
}

function Data() {
  const busy = signal(false);
  // The leagues kept, again whenever an update writes a day.
  const kept = resource(engine.version, () => leagues());
  const status = () => {
    const m = engine.meta();
    if (!m) return t("settings.noData");
    if (engine.failure()) return t(engine.offline() ? "update.offline" : "update.stale", { ago: ago(checkedAt(m)) });
    return t("settings.updatedAt", { league: m.league, ago: ago(checkedAt(m)) });
  };
  const next = () => {
    const at = nextUpdateAt();
    return at <= Date.now() ? t("settings.nextNow") : t("settings.nextAt", { minutes: Math.max(1, Math.ceil((at - Date.now()) / 60_000)) });
  };
  const days = () =>
    (kept() ?? []).map((l) => t("settings.historyLeague", { league: l.league, from: day(l.start), to: day(l.last) })).join(" · ") || t("settings.historyNone");
  const update = async () => {
    busy.set(true);
    const result = await updateNow();
    busy.set(false);
    if (result === "fresh") toast(t("update.fresh"), "info");
    else if (result === "failed" && engine.offline() && engine.meta()) toast(t("update.offlineToast"), "info");
    else if (result === "failed") toast(t("update.failedToast", { error: engine.failure() ?? "" }), "error");
    else toast(t("update.done"));
  };
  const clear = async () => {
    if (!(await confirm({ title: t("settings.clearTitle"), description: t("settings.clearHint"), action: t("settings.clearAction"), destructive: true }))) return;
    await clearData();
    toast(t("settings.cleared"), "info");
  };
  return (
    <Card class="gap-5">
      <Setting title={status()} hint={`${t("settings.limit", { minutes: REFRESH_MINUTES })} ${engine.updating() ? "" : next()}`}>
        <Button
          label={t("settings.updateNow")}
          icon="refresh-cw"
          size="sm"
          variant="outline"
          busy={busy() || engine.updating()}
          onPress={update}
          testID="update-now"
        />
      </Setting>
      <Separator />
      <View class="gap-0.5">
        <Text class="text-sm text-foreground">{t("settings.history")}</Text>
        <Text class="text-xs text-muted-foreground">{days()}</Text>
      </View>
      <Separator />
      <View class="gap-0.5">
        <Text class="text-sm text-foreground">{t("settings.location")}</Text>
        <Text class="text-xs text-muted-foreground" testID="data-location">
          {dataLocation() ?? t("settings.locationStorage")}
        </Text>
      </View>
      <Separator />
      <Setting title={t("settings.clear")} hint={t("settings.clearHint")}>
        <Button label={t("settings.clearAction")} icon="trash" size="sm" variant="destructive" disabled={engine.updating()} onPress={clear} testID="clear-data" />
      </Setting>
    </Card>
  );
}

/** poe.ninja's pages as they came and the item pictures: how much, where, and clearing them. */
function Cache() {
  // Measured again after each update and each clearing.
  const size = resource(engine.version, () => cacheSize());
  const clear = async () => {
    if (!(await confirm({ title: t("settings.clearCacheTitle"), description: t("settings.clearCacheHint"), action: t("settings.clearCache"), destructive: true })))
      return;
    await clearCache();
    toast(t("settings.cacheCleared"), "info");
  };
  return (
    <Card class="gap-5">
      <View class="gap-0.5">
        <Text class="text-sm text-foreground" testID="cache-size">
          {t("settings.cacheSize", { size: bytes(size() ?? 0) })}
        </Text>
        <Text class="text-xs text-muted-foreground">{t("settings.cacheHint")}</Text>
      </View>
      <Separator />
      <View class="gap-0.5">
        <Text class="text-sm text-foreground">{t("settings.location")}</Text>
        <Text class="text-xs text-muted-foreground" testID="cache-location">
          {cacheLocation() ?? t("settings.locationStorage")}
        </Text>
      </View>
      <Separator />
      <Setting title={t("settings.clearCache")} hint={t("settings.clearCacheHint")}>
        <Button
          label={t("settings.clearCache")}
          icon="trash"
          size="sm"
          variant="destructive"
          disabled={engine.updating()}
          onPress={clear}
          testID="clear-cache"
        />
      </Setting>
    </Card>
  );
}

export function Settings() {
  return (
    <Page title={t("settings.title")} testID="page-settings">
      <Section title={t("settings.general")}>
        <General />
      </Section>
      <Section title={t("settings.data")}>
        <Data />
      </Section>
      <Section title={t("settings.cache")}>
        <Cache />
      </Section>
      <Text class="text-xs text-muted-foreground">{t("settings.footnote")}</Text>
      <Text class="text-xs text-muted-foreground">{t("common.disclaimer")}</Text>
      <Text class="text-xs text-muted-foreground">{t("common.notAffiliated")}</Text>
    </Page>
  );
}
