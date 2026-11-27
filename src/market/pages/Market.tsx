// The market at a glance: the heat map (size is what trades, color the day's change), the movers by period and
// kind, and the anomalies worth a look.
import { itemName, t } from "../data/i18n";
import { createMotion, type JSX, reduceMotion, resource, signal, Text, token, View } from "nsh";
import { Plot, Treemap } from "nsh/base/plot";
import { errorText } from "../data/ninja";
import { engine } from "../data/engine";
import { fetchRows, fetchSummary, kindLabel, KINDS, retry } from "../data/market";
import type { Brief, HeatCell, Kind, Period, Summary } from "../data/types";
import { openItem } from "../nav";
import { ago, percent, price, trim } from "../ui/format";
import { ItemRow } from "../ui/ItemRow";
import { Disclaimer, Page } from "../ui/Page";
import { Change } from "../ui/Stat";
import { Button, Select, Card, Empty, ErrorState, Skeleton, SkeletonList, Segmented } from "../../ui";

type View_ = "heatmap" | "movers" | "anomalies";

type Node = { id: string; parent?: string; name: string; value?: number; change?: number };

function Heatmap(props: { summary: Summary }) {
  const hovered = signal<number | null>(null);
  const nodes = (): Node[] => {
    const kinds = [...new Set(props.summary.heatmap.map((c) => c.kind))];
    return [
      ...kinds.map((k) => ({ id: k, name: kindLabel(k) })),
      ...props.summary.heatmap.map((c: HeatCell) => ({ id: c.id, parent: c.kind, name: itemName(c.name), value: c.value, change: c.change ?? 0 })),
    ];
  };
  const shown = () => {
    const i = hovered();
    const n = i == null ? undefined : nodes()[i];
    return n?.parent ? n : undefined;
  };
  const motion = reduceMotion() ? null : { appear: { duration: 500 }, update: { duration: 240 }, enter: { duration: 120 }, exit: { duration: 160 } };
  return (
    <View class="gap-3">
      <View class="h-9 flex-row items-center gap-3">
        <If when={shown()} else={<Text class="text-sm text-muted-foreground">{t("market.heatHint")}</Text>}>
          {(n) => (
            <>
              <Text class="text-sm font-semibold text-foreground">{n().name}</Text>
              <Text class="text-sm tabular-nums text-muted-foreground">{t("market.heatDaily", { value: trim(n().value ?? 0) })}</Text>
              <Change value={n().change} />
              <View class="flex-1" />
              <Button label={t("market.viewChart")} size="sm" variant="ghost" trailingIcon="chevron-right" onPress={() => openItem(n().id, n().name)} />
            </>
          )}
        </If>
      </View>
      <Plot
        data={nodes()}
        colorScale={{ type: "diverging", domain: [-10, 10], pivot: 0, range: [token("heat-down"), token("heat-flat"), token("heat-up")] }}
        accessibilityLabel={t("market.heatLabel", { n: props.summary.heatmap.length })}
        accessibilityValue={{ text: shown() ? `${shown()!.name} ${percent(shown()!.change)}` : undefined }}
        onHoverChange={({ index }) => hovered.set(index)}
        appearGeneration={1}
        motion={motion}
        class="h-[480px]"
      >
        <Treemap
          id="id"
          parent="parent"
          value="value"
          colorValue="change"
          paddingInner={[4, 1]}
          paddingTop={20}
          cornerRadii={3}
          inactiveOpacity={0.5}
          label="name"
          valueLabel={(d: Node) => percent(d.change)}
          labelPlacement="center"
          labelClass="p-1 text-xs font-semibold text-foreground data-dark:text-white"
          valueLabelClass="text-xs tabular-nums text-foreground data-dark:text-white"
          groupClass="rounded-(--radius-sm) bg-muted"
          groupLabel="name"
          groupLabelClass="px-1 text-xs font-semibold text-muted-foreground"
          hoverClass="rounded-xs outline-2 outline-foreground"
        />
      </Plot>
      <Text class="text-xs text-muted-foreground">{t("market.heatFoot")}</Text>
    </View>
  );
}

const PERIOD_KEY = { "1h": "change1h", "1d": "change1d", "7d": "change7d" } as const;

function Movers(props: { summary: Summary }) {
  const period = signal<Period>("1d");
  const kind = signal<"all" | Kind>("all");
  const rows = resource(
    () => {
      const k = kind();
      return k === "all" ? false : ([k, engine.version()] as const);
    },
    ([k]: readonly [Kind, number]) => fetchRows(k),
  );
  const lists = (): { up: Brief[]; down: Brief[] } => {
    if (kind() === "all") return props.summary.movers[period()];
    const file = rows();
    if (!file) return { up: [], down: [] };
    const key = PERIOD_KEY[period()];
    const liquid = file.rows.filter((r) => r.liquidity >= 0.4 && r[key] !== undefined && r.chaos >= 2);
    const sorted = [...liquid].sort((a, b) => b[key]! - a[key]!);
    return { up: sorted.filter((r) => r[key]! > 0).slice(0, 10), down: sorted.filter((r) => r[key]! < 0).reverse().slice(0, 10) };
  };
  const column = (title: string, list: () => Brief[]) => (
    <Card title={title} class="flex-1" bodyClass="p-1">
      <If when={list().length} else={<Text class="py-6 text-center text-sm text-muted-foreground">{t("market.noData")}</Text>}>
        <View class="gap-0.5">
          <Each of={list()} key={(b: Brief) => b.id}>
            {(b) => (
              <ItemRow item={b()} divine={props.summary.divine} change={b()[PERIOD_KEY[period()]]} onPress={() => openItem(b().id, b().name)} />
            )}
          </Each>
        </View>
      </If>
    </Card>
  );
  return (
    <View class="gap-4">
      <View class="flex-row items-center gap-3">
        <Segmented
          label={t("market.period")}
          value={period()}
          onChange={(p) => period.set(p)}
          items={[
            { value: "1h", label: t("market.hour") },
            { value: "1d", label: t("market.day") },
            { value: "7d", label: t("market.week") },
          ]}
        />
        <Select
          label={t("search.label")}
          value={kind()}
          onChange={(v) => kind.set(v as "all" | Kind)}
          class="w-32"
          options={[{ value: "all", title: t("kind.all") }, ...KINDS.map((k) => ({ value: k, title: kindLabel(k) }))]}
        />
        <If when={period() === "1h"}>
          <Text class="text-xs text-muted-foreground">{t("market.hourOnly")}</Text>
        </If>
      </View>
      <If when={!rows.loading()} else={<SkeletonList rows={6} rowClass="h-10" />}>
        <View class="flex-row gap-3">
          {column(t("market.up"), () => lists().up)}
          {column(t("market.down"), () => lists().down)}
        </View>
      </If>
    </View>
  );
}

function Anomalies(props: { summary: Summary }) {
  return (
    <If
      when={props.summary.anomalies.length}
      else={<Empty icon="info" title={t("market.noAnomalies")} description={t("market.anomaliesHint")} />}
    >
      <View class="gap-2">
        <Text class="text-xs text-muted-foreground">{t("market.anomaliesHint")}</Text>
        <View class="gap-0.5">
          <Each of={props.summary.anomalies} key={(b: Brief) => b.id}>
            {(b) => <ItemRow item={b()} divine={props.summary.divine} change={b().change1d} showTags onPress={() => openItem(b().id, b().name)} />}
          </Each>
        </View>
      </View>
    </If>
  );
}

export function Market() {
  const tab = signal<View_>("heatmap");
  // Again whenever an update brings a new market.
  const summary = resource(engine.version, () => fetchSummary());
  return (
    <Page
      title={t("market.title")}
      subtitle={summary() ? t("common.updated", { league: summary()!.league, ago: ago(summary()!.at), divine: Math.round(summary()!.divine) }) : t("common.loading")}
      actions={
        <>
          <Segmented
            label={t("market.view")}
            value={tab()}
            onChange={(v) => tab.set(v)}
            items={[
              { value: "heatmap", label: t("market.heatmap") },
              { value: "movers", label: t("market.movers") },
              { value: "anomalies", label: t("market.anomalies") },
            ]}
          />
        </>
      }
      footer={<Disclaimer />}
      testID="page-market"
    >
      <If when={!summary.error()} else={<ErrorState message={errorText(summary.error())} onRetry={() => retry(summary)} />}>
        <If when={summary()} else={<Skeleton class="h-[480px] rounded-(--radius-lg)" />}>
          {(s) => (
            <>
              <If when={tab() === "heatmap"}>
                <Panel>
                  <Heatmap summary={s()} />
                </Panel>
              </If>
              <If when={tab() === "movers"}>
                <Panel>
                  <Movers summary={s()} />
                </Panel>
              </If>
              <If when={tab() === "anomalies"}>
                <Panel>
                  <Anomalies summary={s()} />
                </Panel>
              </If>
            </>
          )}
        </If>
      </If>
    </Page>
  );
}

/** A tab's panel, fading in when it shows. */
function Panel(props: { children: JSX.Element }) {
  const fade = createMotion({ enter: "fadeIn", duration: 240 });
  return <View style={fade.style}>{props.children}</View>;
}
