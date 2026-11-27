// The app's charts on nsh/base/plot: the sparkline of a list's row, and an item's price with its volume.
import { reduceMotion, signal, Text, token, View } from "nsh";
import { t } from "../data/i18n";
import { Area, Bar, Grid, Line, Plot, PlotAxis } from "nsh/base/plot";
import { day, price as fmtPrice, trim } from "./format";

/** A row's last days, static: no axes, no motion, colored by its direction. */
export function Sparkline(props: { values: number[] | undefined; class?: string }) {
  const points = () => (props.values ?? []).map((v, i) => ({ i, v }));
  const rising = () => {
    const v = props.values ?? [];
    return v.length > 1 && v[v.length - 1] >= v[0];
  };
  return (
    <If when={(props.values?.length ?? 0) > 1} else={<View class={props.class ?? "h-6 w-20"} />}>
      <Plot data={points()} y="v" interactive={false} accessibilityLabel={t("common.trend")} class={props.class ?? "h-6 w-20"}>
        <Line class={`stroke-[1.5] ${rising() ? "stroke-up" : "stroke-down"}`} />
      </Plot>
    </If>
  );
}

export interface PricePoint {
  day: string;
  chaos: number;
  depth: number;
  /** Another season's price on the same day of its league, to compare. */
  compare?: number;
}

/** An item's price by day with its volume under it, the cheap and dear zones as lines. */
export function PriceChart(props: {
  points: PricePoint[];
  divine: number;
  zones?: { cheap: number; dear: number };
  compareLabel?: string;
}) {
  const hovered = signal<number | null>(null);
  const motion = reduceMotion() ? null : { appear: { duration: 500 }, update: { duration: 240 } };
  const top = () => Math.max(1, ...props.points.map((p) => Math.max(p.chaos, p.compare ?? 0)));
  // Dear items are drawn in divines, so the axis takes round steps of the unit the price is read in.
  const unit = () => (props.divine > 0 && top() >= props.divine ? props.divine : 1);
  const unitName = () => (unit() === 1 ? "c" : "div");
  const max = () => (top() / unit()) * 1.1;
  // About five ticks along the days, evenly spaced rows.
  const dayTicks = () => {
    const n = props.points.length;
    const step = Math.max(1, Math.ceil((n - 1) / 4));
    return Array.from({ length: Math.floor((n - 1) / step) + 1 }, (_, i) => i * step);
  };
  const maxDepth = () => Math.max(1, ...props.points.map((p) => p.depth)) * 3;
  const shown = () => {
    const i = hovered();
    return i == null ? props.points[props.points.length - 1] : props.points[i];
  };
  const hasCompare = () => props.points.some((p) => p.compare !== undefined);
  return (
    <View class="gap-2">
      <View class="flex-row items-baseline gap-3">
        <Text class="text-sm text-muted-foreground">{shown() ? day(shown()!.day) : ""}</Text>
        <Text class="text-base font-semibold tabular-nums text-foreground">{shown() ? fmtPrice(shown()!.chaos, props.divine) : ""}</Text>
        <Text class="text-xs tabular-nums text-muted-foreground">{shown() ? t("item.depth", { n: trim(shown()!.depth) }) : ""}</Text>
        <If when={hasCompare() && shown()?.compare !== undefined}>
          <Text class="text-xs tabular-nums text-chart-2">{`${props.compareLabel ?? t("item.compareShort")} ${fmtPrice(shown()?.compare ?? 0, props.divine)}`}</Text>
        </If>
      </View>
      <Plot
        data={props.points}
        y={(p: PricePoint) => p.chaos / unit()}
        yScale={{ type: "linear", domain: [0, max()] }}
        y2Scale={{ type: "linear", domain: [0, maxDepth()] }}
        motion={motion}
        appearGeneration={1}
        onHoverChange={({ index }) => hovered.set(index)}
        accessibilityLabel={t("item.chartLabel", { n: props.points.length })}
        crossLineClass="w-px h-full bg-border"
        dotClass="size-2.5 rounded-full border-2 border-background bg-chart-1"
        class="mb-6 ml-14 h-64"
      >
        <Grid ticks={4} class="stroke-border" />
        <Bar value="depth" scale="y2" stagger={0.4} inactiveOpacity={0.6} class="fill-muted-foreground/20" />
        <Area y1={(p: PricePoint) => p.chaos / unit()} class="fill-chart-1/10" />
        <Line class="stroke-chart-1 stroke-2" />
        <If when={hasCompare()}>
          <Line y={(p: PricePoint) => (p.compare === undefined ? Number.NaN : p.compare / unit())} class="stroke-chart-2 stroke-[1.5] opacity-80" />
        </If>
        <If when={props.zones}>
          {(z) => (
            <>
              <Line y={() => z().cheap / unit()} curve="linear" class="stroke-down stroke-1 opacity-60" />
              <Line y={() => z().dear / unit()} curve="linear" class="stroke-up stroke-1 opacity-60" />
            </>
          )}
        </If>
        <PlotAxis placement="left" ticks={4} format={(v) => `${trim(v)} ${unitName()}`} labelClass="pr-2 text-xs tabular-nums text-muted-foreground" />
        <PlotAxis
          placement="bottom"
          tickValues={dayTicks()}
          format={(v) => (props.points[Math.round(v)] ? day(props.points[Math.round(v)].day) : "")}
          labelClass="pt-1.5 text-xs text-muted-foreground"
        />
      </Plot>
    </View>
  );
}

export { token };
