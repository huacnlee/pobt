// One opportunity, step by step: what to buy where, how to sell it, and a check-off that writes it in the ledger.
import { t } from "../data/i18n";
import { opportunityTitle, phrase } from "../data/phrase";
import { resource, signal, Text, View } from "nsh";
import { errorText } from "../data/ninja";
import { addTrade, ledger } from "../data/local";
import { engine } from "../data/engine";
import { fetchOpportunities, itemIcons } from "../data/market";
import type { Cycle, Opportunity } from "../data/types";
import { go, openItem, stack } from "../nav";
import { CycleRing } from "../ui/CycleRing";
import { hours, price, signedChaos, trim } from "../ui/format";
import { Disclaimer, Page } from "../ui/Page";
import { RiskBadge, where } from "../ui/Risk";
import { Stat } from "../ui/Stat";
import { Button, Field, NumberField, Card, Section, Empty, ErrorState, SkeletonList, toast, Checkbox } from "../../ui";

function Steps(props: { item: Opportunity; divine: number }) {
  const done = signal<Set<number>>(new Set());
  const qty = signal<number | null>(props.item.buy.qty);
  const paid = signal<number | null>(Number(props.item.buy.price.toFixed(2)));
  const logged = () => ledger().some((t) => t.opportunityId === props.item.id);
  // Its picture, kept with the trade so the ledger shows it.
  const icon = resource(() => props.item.itemId, (id) => itemIcons([id]));
  // Bought is enough to write it down; the sale is filled in later, in the ledger.
  const bought = () => done().has(0);
  const toggle = (i: number, on: boolean) =>
    done.update((s) => {
      const next = new Set(s);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });
  const record = () => {
    if (!qty() || !paid()) return;
    addTrade({ itemId: props.item.itemId, itemName: props.item.itemName, icon: icon()?.get(props.item.itemId), qty: qty()!, buy: paid()!, opportunityId: props.item.id });
    toast(t("opp.recordedToast"));
  };
  return (
    <Section title={t("opp.steps")}>
      <Card class="gap-1 p-2">
        <Each of={props.item.steps} key="index">
          {(step, i) => (
            <Checkbox checked={done().has(i())} onChange={(on) => toggle(i(), on)} label={phrase(step(), props.divine)}>
              <View class="flex-1 flex-row gap-2">
                <Text class="w-5 text-sm tabular-nums text-muted-foreground">{`${i() + 1}.`}</Text>
                <Text class={`flex-1 text-sm transition-colors duration-[120ms] ${done().has(i()) ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {phrase(step(), props.divine)}
                </Text>
              </View>
            </Checkbox>
          )}
        </Each>
      </Card>
      <Card class="gap-4">
        <Text class="text-sm font-semibold text-card-foreground">{t("opp.recordTitle")}</Text>
        <View class="flex-row gap-4">
          <View class="flex-1">
            <Field label={t("opp.qty")}>
              <NumberField value={qty()} onChange={(v) => qty.set(v)} label={t("opp.qty")} min={1} testID="qty" />
            </Field>
          </View>
          <View class="flex-1">
            <Field label={t("opp.paid")} hint={t("opp.paidHint")}>
              <NumberField value={paid()} onChange={(v) => paid.set(v)} label={t("opp.paid")} min={0} step={0.5} suffix="c" testID="paid" />
            </Field>
          </View>
        </View>
        <View class="flex-row items-center gap-3">
          <Button
            label={logged() ? t("opp.recorded") : t("opp.record")}
            icon={logged() ? "circle-check" : "plus"}
            variant="primary"
            disabled={!bought() || logged() || !qty() || !paid()}
            onPress={record}
            testID="record"
            class="transition-opacity duration-[240ms]"
          />
          <Text class="text-xs text-muted-foreground">{bought() ? t("opp.total", { total: trim((qty() ?? 0) * (paid() ?? 0)) }) : t("opp.checkFirst")}</Text>
          <View class="flex-1" />
          <If when={logged()}>
            <Button label={t("opp.viewLedger")} variant="ghost" size="sm" trailingIcon="chevron-right" onPress={() => go("ledger")} />
          </If>
        </View>
      </Card>
    </Section>
  );
}

/** A cycle's ring, with its items' pictures. */
function Loop(props: { cycle: Cycle; divine: number }) {
  const icons = resource(() => itemIcons(props.cycle.ids));
  return (
    <Section title={t("ring.title")}>
      <Card>
        <If when={props.cycle.legs?.length} else={<Text class="text-xs text-muted-foreground">{t("ring.noLegs")}</Text>}>
          <CycleRing cycle={props.cycle} divine={props.divine} icons={icons()} />
        </If>
      </Card>
    </Section>
  );
}

export function OpportunityDetail(props: { id: string }) {
  const data = resource(engine.version, () => fetchOpportunities());
  const item = () => data()?.opportunities.find((o) => o.id === props.id);
  return (
    <Page title={item() ? opportunityTitle(item()!) : t("opp.title")} onBack={() => stack.pop()} footer={<Disclaimer />} testID="page-opportunity">
      <If when={!data.error()} else={<ErrorState message={errorText(data.error())} />}>
        <If when={data()} else={<SkeletonList rows={3} />}>
          <If when={item()} else={<Empty icon="sparkles" title={t("opp.expired")} description={t("opp.expiredHint")} />}>
            {(o) => (
              <>
                <View class="flex-row flex-wrap gap-8">
                  <Stat label={t("opp.profit")} value={signedChaos(o().profit)} tone="up" hint={t("opp.roi", { roi: (o().roi * 100).toFixed(0) })} />
                  <Stat label={t("opp.stake")} value={price(o().buy.cost, data()!.divine)} hint={t("opp.stakeHint", { qty: o().buy.qty, price: price(o().buy.price, data()!.divine) })} />
                  <Stat label={t("opp.target")} value={price(o().sell.price, data()!.divine)} hint={where(o().sell.where)} />
                  <Stat label={t("opp.sellTime")} value={hours(o().sellHours)} />
                  <View class="gap-1">
                    <Text class="text-xs text-muted-foreground">{t("opp.risk")}</Text>
                    <RiskBadge risk={o().risk} />
                  </View>
                </View>
                <Section
                  title={t("opp.why")}
                  actions={<Button label={t("opp.viewChart")} variant="ghost" size="sm" trailingIcon="chevron-right" onPress={() => openItem(o().itemId, o().itemName)} />}
                >
                  <View class="gap-1.5">
                    <Each of={o().reasons} key="index">
                      {(r) => <Text class="text-sm text-foreground">{`· ${phrase(r(), data()!.divine)}`}</Text>}
                    </Each>
                  </View>
                </Section>
                <If when={o().type === "cycle" ? (o().cycle ?? data()!.cycles.find((c) => c.id === o().id)) : undefined}>
                  {(cycle) => <Loop cycle={cycle()} divine={data()!.divine} />}
                </If>
                <Steps item={o()} divine={data()!.divine} />
              </>
            )}
          </If>
        </If>
      </If>
    </Page>
  );
}
