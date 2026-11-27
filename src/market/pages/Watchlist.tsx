// The items watched on this device: their price now and since they were added, and their alerts; and the kinds of
// opportunity followed, which notify when a new one appears.
import { itemName, t } from "../data/i18n";
import { ItemArt } from "../ui/ItemArt";
import { LayoutAnimation, reduceMotion, resource, signal, Text, View } from "nsh";
import { askNotifications, checkAll, checkOpportunityAlerts, watchedPrices } from "../data/alerts";
import { errorText } from "../data/ninja";
import { fetchSummary, itemIcons } from "../data/market";
import { type OpportunityAlerts, type OpportunityType, settings, updateWatch, type Watch, watchlist } from "../data/local";
import { engine } from "../data/engine";
import type { Risk } from "../data/types";
import { go, openItem } from "../nav";
import { price, trim } from "../ui/format";
import { Disclaimer, Page } from "../ui/Page";
import { Change } from "../ui/Stat";
import { Button, IconButton, NumberField, Row, Select, Badge, Card, Section, Separator, Empty, ErrorState, toast, Switch } from "../../ui";

function WatchRow(props: { watch: Watch; chaos: number | undefined; icon?: string; divine: number | undefined }) {
  const since = () => (props.chaos === undefined ? undefined : ((props.chaos - props.watch.addedChaos) / props.watch.addedChaos) * 100);
  const remove = () => {
    if (!reduceMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));
    watchlist.update((list) => list.filter((w) => w.id !== props.watch.id));
  };
  const thresholds = () =>
    [props.watch.above !== undefined ? `≥ ${price(props.watch.above, props.divine)}` : "", props.watch.below !== undefined ? `≤ ${price(props.watch.below, props.divine)}` : ""]
      .filter(Boolean)
      .join(" · ");
  return (
    <View class="flex-row items-center gap-2">
      <Row onPress={() => openItem(props.watch.id, props.watch.name)} label={itemName(props.watch.name)} class="flex-1">
        <ItemArt icon={props.icon} name={props.watch.name} size={32} />
        <View class="flex-1 gap-0.5">
          <Text class="text-sm text-foreground line-clamp-1">{itemName(props.watch.name)}</Text>
          <Text class="text-xs text-muted-foreground">{t("watch.addedAt", { price: price(props.watch.addedChaos, props.divine) })}</Text>
        </View>
        <Text class="w-24 text-right text-sm tabular-nums text-foreground">{props.chaos === undefined ? "—" : price(props.chaos, props.divine)}</Text>
        <View class="w-24">
          <Change value={since()} />
        </View>
        <View class="w-40 items-end">
          <If when={thresholds()} else={<Text class="text-xs text-muted-foreground">{t("watch.noAlert")}</Text>}>
            <Badge
              label={props.watch.firedAt !== undefined ? t("watch.hit", { thresholds: thresholds() }) : thresholds()}
              tone={props.watch.firedAt !== undefined ? "warning" : props.watch.alertsOn ? "primary" : "neutral"}
              icon="bell"
            />
          </If>
        </View>
      </Row>
      <View class="w-28 items-end">
        <If when={thresholds()}>
          <Switch
            checked={props.watch.alertsOn}
            label={props.watch.alertsOn ? t("watch.on") : t("watch.off")}
            onChange={async (on) => {
              updateWatch(props.watch.id, { alertsOn: on, firedAt: undefined });
              if (on && !(await askNotifications())) toast(t("watch.noNotifications"), "info");
            }}
          />
        </If>
      </View>
      <IconButton icon="trash" label={t("watch.remove")} onPress={remove} />
    </View>
  );
}

/** A kind of opportunity followed or not: its name and what it is, and the switch. */
function OpportunityTypeRow(props: { type: OpportunityType; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <View class="flex-row items-center justify-between gap-4">
      <View class="flex-1 gap-0.5">
        <Text class="text-sm text-foreground">{t(`opp.${props.type}`)}</Text>
        <Text class="text-xs text-muted-foreground">{t(`watch.opp${props.type === "dip" ? "Dip" : "Cycle"}Hint`)}</Text>
      </View>
      <View class="w-28 items-end">
        <Switch checked={props.on} label={props.on ? t("watch.on") : t("watch.off")} name={t("watch.oppSwitch", { type: t(`opp.${props.type}`) })} onChange={props.onChange} />
      </View>
    </View>
  );
}

/** The kinds of opportunity followed, and the least profit and most risk a new one needs to notify. */
function OpportunityAlertsCard() {
  const alerts = (): OpportunityAlerts => settings().oppAlerts ?? { dip: false, cycle: false };
  const change = (patch: Partial<OpportunityAlerts>) => settings.update((s) => ({ ...s, oppAlerts: { ...alerts(), ...patch } }));
  const turn = async (type: OpportunityType, on: boolean) => {
    change({ [type]: on });
    // Takes in what is listed now, so only opportunities appearing after this notify.
    checkOpportunityAlerts().catch(() => 0);
    if (on && !(await askNotifications())) toast(t("watch.noNotifications"), "info");
  };
  return (
    <Card class="gap-4">
      <OpportunityTypeRow type="dip" on={alerts().dip} onChange={(on) => turn("dip", on)} />
      <Separator />
      <OpportunityTypeRow type="cycle" on={alerts().cycle} onChange={(on) => turn("cycle", on)} />
      <Separator />
      <View class="flex-row flex-wrap items-center gap-x-6 gap-y-3">
        <View class="flex-row items-center gap-2">
          <Text class="text-sm text-foreground">{t("watch.oppMinProfit")}</Text>
          <NumberField
            value={alerts().minProfit ?? null}
            onChange={(v) => change({ minProfit: v === null || v <= 0 ? undefined : v })}
            label={t("watch.oppMinProfit")}
            min={0}
            step={10}
            suffix="c"
            class="w-28"
            testID="opp-min-profit"
          />
        </View>
        <View class="flex-row items-center gap-2">
          <Text class="text-sm text-foreground">{t("watch.oppMaxRisk")}</Text>
          <Select
            label={t("watch.oppMaxRisk")}
            value={alerts().maxRisk ?? "high"}
            onChange={(v) => change({ maxRisk: v === "high" ? undefined : (v as Risk) })}
            class="w-36"
            options={[
              { value: "high", title: t("opp.anyRisk") },
              { value: "medium", title: t("opp.upToMedium") },
              { value: "low", title: t("opp.lowOnly") },
            ]}
          />
        </View>
      </View>
      <Text class="text-xs text-muted-foreground">{t("watch.oppAlertsHint")}</Text>
    </Card>
  );
}

export function Watchlist() {
  const force = signal(1);
  const summary = resource(engine.version, () => fetchSummary());
  // Again when a new market is in, when the list changes, and on Check.
  const prices = resource(
    () => [force(), engine.version(), watchlist().length] as const,
    () => watchedPrices(),
  );
  // Items watched before pictures were kept: theirs from the market's rows.
  const icons = resource(
    () => watchlist().filter((w) => !w.icon).map((w) => w.id).join(","),
    (ids) => itemIcons(ids.split(",")),
  );
  const refresh = async () => {
    force.update((n) => n + 1);
    const fired = await checkAll();
    toast(fired ? t("watch.fired", { n: fired }) : t("watch.checked"), "info");
  };
  return (
    <Page
      title={t("watch.title")}
      subtitle={t("watch.subtitle", { n: watchlist().length })}
      actions={<Button label={t("watch.check")} icon="refresh-cw" size="sm" variant="outline" onPress={refresh} />}
      footer={<Disclaimer />}
      testID="page-watchlist"
    >
      <If when={!prices.error()} else={<ErrorState message={errorText(prices.error())} onRetry={() => force.update((n) => n + 1)} />}>
        <If
          when={watchlist().length}
          else={
            <Empty
              icon="star"
              title={t("watch.empty")}
              description={t("watch.emptyHint")}
              action={<Button label={t("watch.toSearch")} variant="outline" size="sm" onPress={() => go("search")} />}
            />
          }
        >
          <View class="gap-1">
            <Each of={watchlist()} key={(w: Watch) => w.id}>
              {(w) => <WatchRow watch={w()} chaos={prices()?.get(w().id)} icon={w().icon ?? icons()?.get(w().id)} divine={summary()?.divine} />}
            </Each>
          </View>
        </If>
      </If>
      <Section title={t("watch.oppAlerts")}>
        <OpportunityAlertsCard />
      </Section>
    </Page>
  );
}
