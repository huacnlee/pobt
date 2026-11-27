// The trades made: what was bought and sold, and the profit made. Kept on this device.
import { itemName, t } from "../data/i18n";
import { createMotion, LayoutAnimation, reduceMotion, resource, signal, Text, View } from "nsh";
import { Button as BaseButton, Popover } from "nsh/base";
import { Plot, Line, Area, Grid, PlotAxis } from "nsh/base/plot";
import { addTrade, ledger, ledgerTotals, removeTrade, type Trade, updateTrade } from "../data/local";
import { engine } from "../data/engine";
import { fetchSummary, findRow, itemIcons } from "../data/market";
import { ItemArt } from "../ui/ItemArt";
import { openItem } from "../nav";
import { day, price, signedChaos, trim } from "../ui/format";
import { Page } from "../ui/Page";
import { Stat } from "../ui/Stat";
import { Button, IconButton, Field, Input, NumberField, confirm, Modal, popup, popupEnding, popupStarting, Badge, Card, Section, Empty, toast } from "../../ui";

function SellPopover(props: { trade: Trade }) {
  const open = signal(false);
  const sell = signal<number | null>(props.trade.buy);
  return (
    <Popover
      open={open()}
      onOpenChange={(e) => open.set(e.open)}
      placement="bottom"
      align="end"
      offset={6}
      popupClass={`${popup} w-64 gap-3 p-4`}
      popupStartingClass={popupStarting}
      popupEndingClass={popupEnding}
      trigger={<Button label={t("ledger.sell")} size="sm" variant="outline" />}
    >
      <Field label={t("ledger.sellPrice")} hint={t("opp.paidHint")}>
        <NumberField value={sell()} onChange={(v) => sell.set(v)} label={t("ledger.sellLabel")} min={0} step={0.5} suffix="c" />
      </Field>
      <Button
        label={t("ledger.confirm")}
        size="sm"
        variant="primary"
        disabled={sell() === null}
        onPress={() => {
          updateTrade(props.trade.id, { sell: sell()!, soldAt: new Date().toISOString() });
          open.set(false);
          toast(t("ledger.noted", { profit: signedChaos((sell()! - props.trade.buy) * props.trade.qty) }));
        }}
      />
    </Popover>
  );
}

function TradeRow(props: { trade: Trade; index: number; icon?: string; divine: number | undefined }) {
  // A trade just added rises in at the top; the rest are there from the start.
  const isNew = Date.now() - Date.parse(props.trade.at) < 2000;
  const enter = createMotion(isNew ? { enter: "fadeInUp", duration: 360 } : {});
  const profit = () => (props.trade.sell === undefined ? undefined : (props.trade.sell - props.trade.buy) * props.trade.qty);
  const remove = async () => {
    if (!(await confirm({ title: t("ledger.deleteTitle", { item: itemName(props.trade.itemName) }), description: t("ledger.deleteHint"), action: t("common.delete"), destructive: true }))) return;
    if (!reduceMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));
    removeTrade(props.trade.id);
  };
  return (
    <View style={enter.style} class="flex-row items-center gap-3 rounded-(--radius) px-3 py-2 hover:bg-accent/50">
      <ItemArt icon={props.icon} name={props.trade.itemName} size={32} />
      <BaseButton
        onPress={() => props.trade.itemId && openItem(props.trade.itemId, props.trade.itemName)}
        disabled={!props.trade.itemId}
        accessibilityLabel={itemName(props.trade.itemName)}
        class="flex-1 gap-0.5 rounded-(--radius-sm) focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Text class={`text-sm text-foreground line-clamp-1 ${props.trade.itemId ? "hover:underline" : ""}`}>{itemName(props.trade.itemName)}</Text>
        <Text class="text-xs text-muted-foreground">{`${t("ledger.bought", { day: day(props.trade.at) })}${props.trade.soldAt ? t("ledger.sold", { day: day(props.trade.soldAt) }) : ""}`}</Text>
      </BaseButton>
      <Text class="w-28 text-right text-sm tabular-nums text-muted-foreground">{`${props.trade.qty} × ${price(props.trade.buy, props.divine)}`}</Text>
      <Text class="w-24 text-right text-sm tabular-nums text-muted-foreground">{props.trade.sell === undefined ? "—" : price(props.trade.sell, props.divine)}</Text>
      <View class="w-28 items-end">
        <If when={profit() !== undefined} else={<Badge label={t("ledger.holding")} tone="primary" />}>
          <Text class={`text-sm font-semibold tabular-nums ${profit()! >= 0 ? "text-up" : "text-down"}`}>{signedChaos(profit()!)}</Text>
        </If>
      </View>
      <View class="w-20 items-end">
        <If when={props.trade.sell === undefined}>
          <SellPopover trade={props.trade} />
        </If>
      </View>
      <IconButton icon="trash" label={t("ledger.deleteLabel")} size="sm" onPress={remove} />
    </View>
  );
}

function AddTrade(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const name = signal("");
  const qty = signal<number | null>(1);
  const buy = signal<number | null>(null);
  const valid = () => name().trim() && qty() && buy() !== null;
  const save = () => {
    if (!valid()) return;
    const typed = name().trim();
    const entry = addTrade({ itemId: "", itemName: typed, qty: qty()!, buy: buy()! });
    // A name the market knows gets its item (so the row opens it) and its picture.
    findRow(typed)
      .then((row) => row && updateTrade(entry.id, { itemId: row.id, itemName: row.name, icon: row.icon }))
      .catch(() => {});
    name.set("");
    buy.set(null);
    props.onOpenChange(false);
    toast(t("ledger.saved"));
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("ledger.addTitle")}
      description={t("ledger.addHint")}
      footer={
        <>
          <Button label={t("common.cancel")} variant="ghost" onPress={() => props.onOpenChange(false)} />
          <Button label={t("common.save")} variant="primary" disabled={!valid()} onPress={save} />
        </>
      }
    >
      <Field label={t("ledger.item")}>
        <Input value={name()} onChange={(v) => name.set(v)} placeholder={t("ledger.itemPlaceholder")} autoFocus />
      </Field>
      <View class="flex-row gap-3">
        <View class="flex-1">
          <Field label={t("ledger.qty")}>
            <NumberField value={qty()} onChange={(v) => qty.set(v)} label={t("ledger.qty")} min={1} />
          </Field>
        </View>
        <View class="flex-1">
          <Field label={t("ledger.buy")}>
            <NumberField value={buy()} onChange={(v) => buy.set(v)} label={t("ledger.buy")} min={0} step={0.5} suffix="c" />
          </Field>
        </View>
      </View>
    </Modal>
  );
}

/** What the trades sold made, added up day by day. */
function ProfitChart(props: { trades: Trade[] }) {
  const points = () => {
    const sold = props.trades.filter((t) => t.sell !== undefined && t.soldAt).sort((a, b) => a.soldAt!.localeCompare(b.soldAt!));
    let total = 0;
    const byDay = new Map<string, number>();
    for (const t of sold) {
      total += (t.sell! - t.buy) * t.qty;
      byDay.set(t.soldAt!.slice(0, 10), total);
    }
    return [...byDay].map(([d, v]) => ({ day: d, total: v }));
  };
  return (
    <If when={points().length > 1} else={<Text class="py-6 text-center text-sm text-muted-foreground">{t("ledger.chartShort")}</Text>}>
      <Plot data={points()} y="total" accessibilityLabel={t("ledger.chartLabel")} class="h-40" motion={reduceMotion() ? null : { appear: { duration: 500 } }} appearGeneration={1}>
        <Grid ticks={3} class="stroke-border" />
        <Area y1="total" class="fill-up/10" />
        <Line class="stroke-up stroke-2" />
        <PlotAxis placement="left" ticks={3} format={(v) => trim(v)} labelClass="text-xs text-muted-foreground" />
        <PlotAxis placement="bottom" ticks={4} format={(v) => (points()[Math.round(v)] ? day(points()[Math.round(v)].day) : "")} labelClass="text-xs text-muted-foreground" />
      </Plot>
    </If>
  );
}

export function Ledger() {
  const adding = signal(false);
  const summary = resource(engine.version, () => fetchSummary());
  const totals = () => ledgerTotals(ledger());
  // Trades written before pictures were kept: theirs from the market's rows.
  const icons = resource(
    () => ledger().filter((t) => !t.icon && t.itemId).map((t) => t.itemId).join(","),
    (ids) => itemIcons(ids.split(",")),
  );
  return (
    <Page
      title={t("ledger.title")}
      subtitle={t("ledger.subtitle")}
      actions={<Button label={t("ledger.add")} icon="plus" size="sm" variant="outline" onPress={() => adding.set(true)} />}
      testID="page-ledger"
    >
      <View class="flex-row flex-wrap gap-10">
        <Stat label={t("ledger.realized")} value={signedChaos(totals().realized)} tone={totals().realized >= 0 ? "up" : "down"} />
        <Stat label={t("ledger.held")} value={price(totals().held, summary()?.divine)} />
        <Stat label={t("ledger.closed")} value={t("ledger.closedCount", { n: totals().closed })} />
        <Stat label={t("ledger.winRate")} value={totals().closed ? `${Math.round(totals().winRate * 100)}%` : "—"} />
      </View>
      <Card>
        <ProfitChart trades={ledger()} />
      </Card>
      <Section title={t("ledger.records")}>
        <If
          when={ledger().length}
          else={<Empty icon="wallet" title={t("ledger.empty")} description={t("ledger.emptyHint")} />}
        >
          <View class="gap-0.5">
            <Each of={ledger()} key={(t: Trade) => t.id}>
              {(t, i) => <TradeRow trade={t()} index={i()} icon={t().icon ?? icons()?.get(t().itemId)} divine={summary()?.divine} />}
            </Each>
          </View>
        </If>
      </Section>
      <AddTrade open={adding()} onOpenChange={(o) => adding.set(o)} />
    </Page>
  );
}
