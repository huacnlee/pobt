// One item: its price by day with its volume, the cheap and dear zones, how fast it sells, a forecast, another
// season kept on this device to compare, and the watch and alert.
import { categoryLabel, influenceLabel, itemName, t } from "../data/i18n";
import { ItemArt } from "../ui/ItemArt";
import { createMotion, openUrl, resource, signal, Text, View } from "nsh";
import { Popover } from "nsh/base";
import { errorText } from "../data/ninja";
import { isWatched, toggleWatch, updateWatch, watchlist } from "../data/local";
import { engine } from "../data/engine";
import { fetchItem, retry } from "../data/market";
import type { ItemDetail, Row as MarketRow, Tag } from "../data/types";
import { stack } from "../nav";
import { askNotifications } from "../data/alerts";
import { PriceChart, type PricePoint } from "../ui/Chart";
import { hours, price, trim } from "../ui/format";
import { TagBadge } from "../ui/ItemRow";
import { Disclaimer, Page } from "../ui/Page";
import { Change, Stat } from "../ui/Stat";
import { Button, IconButton, Field, NumberField, popup, popupEnding, popupStarting, Select, Badge, Card, Section, ErrorState, Skeleton, toast } from "../../ui";

function tradeUrl(league: string, row: MarketRow): string {
  const base = "https://www.pathofexile.com/trade";
  if (row.kind === "currency" || row.kind === "card") return `${base}/exchange/${encodeURIComponent(league)}`;
  const query = row.kind === "unique" ? { name: row.name, type: row.baseType } : { type: row.baseType };
  return `${base}/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query: { status: { option: "online" }, ...query } }))}`;
}

function WatchButton(props: { row: MarketRow }) {
  const watched = () => isWatched(props.row.id);
  // The star swaps: the old one shrinks away, the new one grows in.
  const swap = createMotion();
  const press = () => {
    const now = toggleWatch(props.row);
    swap.play({ keyframes: { scale: [0.6, 1.15, 1], opacity: [0.4, 1, 1] }, duration: 240 });
    toast(now ? t("item.added") : t("item.removed"), "info");
  };
  return (
    <View style={swap.style}>
      <IconButton icon={watched() ? "star-filled" : "star"} tone={watched() ? "warning" : "muted"} label={watched() ? t("item.removeWatch") : t("item.addWatch")} onPress={press} testID="watch" />
    </View>
  );
}

function AlertPopover(props: { row: MarketRow }) {
  const watch = () => watchlist().find((w) => w.id === props.row.id);
  const above = signal<number | null>(watch()?.above ?? Number((props.row.chaos * 1.2).toFixed(1)));
  const below = signal<number | null>(watch()?.below ?? Number((props.row.chaos * 0.8).toFixed(1)));
  const open = signal(false);
  const save = async () => {
    if (!isWatched(props.row.id)) toggleWatch(props.row);
    updateWatch(props.row.id, { above: above() ?? undefined, below: below() ?? undefined, alertsOn: true, firedAt: undefined });
    open.set(false);
    const allowed = await askNotifications();
    toast(allowed ? t("item.alertSaved") : t("item.alertSavedQuiet"), allowed ? "success" : "info");
  };
  return (
    <Popover
      open={open()}
      onOpenChange={(e) => open.set(e.open)}
      placement="bottom"
      align="end"
      offset={6}
      popupClass={`${popup} w-72 gap-4 p-4`}
      popupStartingClass={popupStarting}
      popupEndingClass={popupEnding}
      trigger={<Button label={watch()?.alertsOn ? t("item.alertOn") : t("item.alert")} icon="bell" size="sm" variant="outline" testID="alert" />}
    >
      <Text class="text-sm font-semibold text-popover-foreground">{t("item.alertTitle")}</Text>
      <Text class="text-xs text-muted-foreground">{t("item.alertHint", { price: trim(props.row.chaos) })}</Text>
      <Field label={t("item.above")}>
        <NumberField value={above()} onChange={(v) => above.set(v)} label={t("item.aboveLabel")} min={0} step={0.5} suffix="c" />
      </Field>
      <Field label={t("item.below")}>
        <NumberField value={below()} onChange={(v) => below.set(v)} label={t("item.belowLabel")} min={0} step={0.5} suffix="c" />
      </Field>
      <View class="flex-row justify-end gap-2">
        <If when={watch()?.alertsOn}>
          <Button
            label={t("item.alertOff")}
            size="sm"
            variant="ghost"
            onPress={() => {
              updateWatch(props.row.id, { alertsOn: false });
              open.set(false);
            }}
          />
        </If>
        <Button label={t("common.save")} size="sm" variant="primary" onPress={save} />
      </View>
    </Popover>
  );
}

function Forecast(props: { detail: ItemDetail }) {
  return (
    <If
      when={props.detail.forecast}
      else={<Text class="text-sm text-muted-foreground">{t("item.forecastShort")}</Text>}
    >
      {(f) => (
        <View class="gap-3">
          <View class="flex-row flex-wrap gap-8">
            <Stat label={t("item.inDays", { days: f().days })} value={price(f().chaos, props.detail.divine)} tone={f().trend === "up" ? "up" : f().trend === "down" ? "down" : "foreground"} />
            <Stat label={t("item.range")} value={`${price(f().low, props.detail.divine)} – ${price(f().high, props.detail.divine)}`} />
            <Stat label={t("item.confidence")} value={`${Math.round(f().confidence * 100)}%`} hint={f().confidence < 0.4 ? t("item.lowConfidence") : undefined} />
          </View>
          <Text class="text-xs text-muted-foreground">{t("item.forecastHint")}</Text>
        </View>
      )}
    </If>
  );
}

function Detail(props: { detail: ItemDetail; compare: string; onCompare: (league: string) => void }) {
  const row = () => props.detail.row;
  // Until a few days are kept, poe.ninja's last seven days make the curve (no volume for them).
  const fromSpark = () => props.detail.history.length < 3 && (row().spark?.length ?? 0) > 1;
  const points = (): PricePoint[] => {
    const season = props.detail.season;
    if (fromSpark()) {
      const spark = row().spark!;
      const start = row().chaos / (1 + spark[spark.length - 1] / 100);
      const last = Date.parse(props.detail.at);
      return spark.map((pct, i) => ({
        day: new Date(last - (spark.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
        chaos: start * (1 + pct / 100),
        depth: i === spark.length - 1 ? row().depth : 0,
      }));
    }
    return props.detail.history.map((h) => ({
      day: h.day,
      chaos: h.chaos,
      depth: h.depth,
      compare: season && h.leagueDay !== undefined ? season.points.find((p) => p.day === h.leagueDay)?.chaos : undefined,
    }));
  };
  const zoneText = () => {
    const z = props.detail.zones;
    if (!z) return t("item.zonesShort");
    const where = t(row().chaos <= z.cheap ? "item.zoneCheap" : row().chaos >= z.dear ? "item.zoneDear" : "item.zoneNormal");
    return t("item.zones", { where, cheap: price(z.cheap, props.detail.divine), dear: price(z.dear, props.detail.divine) });
  };
  return (
    <>
      <View class="flex-row flex-wrap items-start gap-8">
        <ItemArt icon={row().icon} name={row().name} size={64} class="rounded-(--radius) border border-border bg-card" />
        <Stat label={t("item.now")} value={price(row().chaos, props.detail.divine)} hint={row().chaos >= props.detail.divine ? `${trim(row().chaos)} c` : undefined} />
        <View class="gap-1">
          <Text class="text-xs text-muted-foreground">{t("item.changes")}</Text>
          <View class="h-8 flex-row items-center gap-4">
            <Change value={row().change1h} size="md" />
            <Change value={row().change1d} size="md" />
            <Change value={row().change7d} size="md" />
          </View>
        </View>
        <Stat label={t("item.liquidity")} value={`${Math.round(row().liquidity * 100)}%`} hint={t(row().kind === "currency" || row().kind === "card" ? "item.dailyVolume" : "item.listings", { n: trim(row().depth) })} />
        <Stat label={t("item.sellTime")} value={hours(row().sellHours)} />
        <Stat label={t("item.worth")} value={price(row().worth, props.detail.divine)} hint={t("item.worthHint")} />
      </View>
      <If when={row().tags.length}>
        <View class="flex-row flex-wrap gap-2">
          <Each of={row().tags} key={(t: Tag) => t}>
            {(tag) => <TagBadge tag={tag()} />}
          </Each>
        </View>
      </If>
      <Card class="gap-3">
        <View class="flex-row items-center justify-between">
          <Text class="text-sm font-semibold text-card-foreground">{t("item.chart")}</Text>
          <If when={props.detail.seasons.length}>
            <Select
              label={t("item.compare")}
              value={props.compare}
              onChange={props.onCompare}
              class="w-44"
              options={[{ value: "", title: t("item.noCompare") }, ...props.detail.seasons.map((s) => ({ value: s, title: t("item.compareWith", { league: s }) }))]}
            />
          </If>
        </View>
        <If when={points().length > 1} else={<Text class="py-8 text-center text-sm text-muted-foreground">{t("item.firstDay")}</Text>}>
          <PriceChart points={points()} divine={props.detail.divine} zones={props.detail.zones} compareLabel={props.detail.season?.league} />
        </If>
        <Text class="text-xs text-muted-foreground">{zoneText()}</Text>
        <If when={fromSpark()}>
          <Text class="text-xs text-muted-foreground">{t("item.fromSpark")}</Text>
        </If>
        <If when={!fromSpark() && props.detail.source === "ninja"}>
          <Text class="text-xs text-muted-foreground">{t("item.fromNinja")}</Text>
        </If>
        <If when={props.detail.season}>
          <Text class="text-xs text-muted-foreground">{t("item.seasonAligned")}</Text>
        </If>
      </Card>
      <Section title={t("item.forecast")}>
        <Card>
          <Forecast detail={props.detail} />
        </Card>
      </Section>
      <If when={row().pair}>
        {(pair) => (
          <Text class="text-xs text-muted-foreground">
            {pair().rate >= 1
              ? t("item.pairBuys", { currency: pair().currency, rate: trim(pair().rate) })
              : t("item.pairSells", { currency: pair().currency, rate: trim(1 / pair().rate) })}
          </Text>
        )}
      </If>
    </>
  );
}

export function Item(props: { id: string; name: string }) {
  const compare = signal("");
  const detail = resource(
    () => [props.id, compare(), engine.version()] as const,
    ([id, c]) => fetchItem(id, c || undefined),
  );
  // While another season loads, the page keeps showing the last one.
  const shown = () => detail();
  return (
    <Page
      title={itemName(props.name)}
      subtitle={shown() ? `${categoryLabel(shown()!.row.category)}${shown()!.row.itemLevel ? ` · ${t("common.level", { level: shown()!.row.itemLevel })}` : ""}${shown()!.row.influence ? ` · ${influenceLabel(shown()!.row.influence!)}` : ""}` : undefined}
      onBack={() => stack.pop()}
      actions={
        <If when={shown()}>
          {(d) => (
            <>
              <Button label={t("item.trade")} icon="external-link" size="sm" variant="ghost" onPress={() => openUrl(tradeUrl(d().league, d().row))} />
              <AlertPopover row={d().row} />
              <WatchButton row={d().row} />
            </>
          )}
        </If>
      }
      footer={<Disclaimer />}
      testID="page-item"
    >
      <If when={!detail.error()} else={<ErrorState message={errorText(detail.error())} onRetry={() => retry(detail)} />}>
        <If when={shown()} else={<Skeleton class="h-96 rounded-(--radius-lg)" />}>
          {(d) => <Detail detail={d()} compare={compare()} onCompare={(league) => compare.set(league)} />}
        </If>
      </If>
    </Page>
  );
}
