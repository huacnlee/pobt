// The opportunities: trades worth making now, ranked, each with its risk; the arbitrage cycles under them.
import { t } from "../data/i18n";
import { cyclePath, opportunityTitle, phrase } from "../data/phrase";
import { ItemArt } from "../ui/ItemArt";
import { createMotion, List, resource, signal, Text, View } from "nsh";
import { errorText } from "../data/ninja";
import { fetchOpportunities, itemIcons, retry } from "../data/market";
import { engine } from "../data/engine";
import type { Cycle, Opportunity, OpportunitiesFile, Risk } from "../data/types";
import { openOpportunity } from "../nav";
import { CycleRing } from "../ui/CycleRing";
import { ago, hours, price, signedChaos } from "../ui/format";
import { Disclaimer, Page } from "../ui/Page";
import { RiskBadge, where } from "../ui/Risk";
import { Accordion, AccordionItem, Icon, Row, Select, Empty, ErrorState, SkeletonList, Segmented } from "../../ui";

type Show = "all" | "dip" | "cycle";
type RiskFilter = "any" | "low" | "medium";

function OpportunityCard(props: { item: Opportunity; divine: number; index: number; icon?: string }) {
  // Only the first screenful comes in as a wave; rows made later by scrolling simply appear.
  const enter = createMotion(props.index < 10 ? { enter: "fadeInUp", delay: props.index * 50, duration: 360 } : {});
  return (
    <View style={enter.style} class="pb-2">
      <Row
        onPress={() => openOpportunity(props.item.id)}
        label={opportunityTitle(props.item)}
        testID={`opportunity-${props.index}`}
        class="items-stretch rounded-(--radius) border border-border bg-card p-3"
      >
        <ItemArt icon={props.icon} name={props.item.itemName} size={40} class="self-center" />
        <View class="flex-1 gap-2">
          <View class="flex-row items-center gap-2">
            <Text class="flex-1 text-sm font-semibold text-card-foreground line-clamp-1">{opportunityTitle(props.item)}</Text>
            <RiskBadge risk={props.item.risk} />
          </View>
          <View class="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text class="text-sm text-muted-foreground">{t("opp.buyAt", { where: where(props.item.buy.where) })}</Text>
            <Text class="text-sm tabular-nums text-foreground">{price(props.item.buy.price, props.divine)}</Text>
            <Icon name="arrow-right" size="sm" tone="muted" />
            <Text class="text-sm text-muted-foreground">{t("opp.sellAt", { where: where(props.item.sell.where) })}</Text>
            <Text class="text-sm tabular-nums text-foreground">{price(props.item.sell.price, props.divine)}</Text>
          </View>
          <Text class="text-xs text-muted-foreground line-clamp-1">{props.item.reasons.map((r) => phrase(r, props.divine)).join(" · ")}</Text>
        </View>
        <View class="w-44 items-end justify-center gap-1">
          <Text class="text-xl font-semibold tabular-nums text-up">{signedChaos(props.item.profit)}</Text>
          <Text class="text-xs tabular-nums text-muted-foreground">{t("opp.roiHours", { roi: (props.item.roi * 100).toFixed(0), hours: hours(props.item.sellHours) })}</Text>
        </View>
      </Row>
    </View>
  );
}

/** A cycle's summary, the header of its card: the path, the net and how much the thinner pair trades. */
function CycleSummary(props: { cycle: Cycle }) {
  return (
    <>
      <Icon name="repeat" tone="primary" />
      <Text class="flex-1 text-sm text-card-foreground">{cyclePath(props.cycle.path)}</Text>
      <Text class="w-24 text-right text-sm font-semibold tabular-nums text-up">{`+${props.cycle.edge.toFixed(1)}%`}</Text>
      <Text class="w-28 text-right text-xs tabular-nums text-muted-foreground">{t("opp.dailyVolume", { n: Math.round(props.cycle.volume) })}</Text>
    </>
  );
}

function Cycles(props: { file: OpportunitiesFile; icons?: Map<string, string> }) {
  // The first is open, its ring drawn: there are seldom more than a few.
  const open = signal<string[]>(props.file.cycles.slice(0, 1).map((c) => c.id));
  return (
    <View class="gap-3 pb-6 pt-3">
      <Text role="header" class="text-sm font-semibold text-foreground">
        {t("opp.cycles")}
      </Text>
      <Text class="text-xs text-muted-foreground">
        {t("opp.cyclesHint")}
      </Text>
      <If
        when={props.file.cycles.length}
        else={<Empty icon="repeat" title={t("opp.noCycles")} description={t("opp.noCyclesHint")} />}
      >
        <Accordion value={open()} onChange={(v) => open.set(v)}>
          <Each of={props.file.cycles} key={(c: Cycle) => c.id}>
            {(c, i) => (
              <AccordionItem value={c().id} header={<CycleSummary cycle={c()} />} label={cyclePath(c().path)} testID={`cycle-${i()}`}>
                <If when={c().legs?.length} else={<Text class="p-4 text-xs text-muted-foreground">{t("ring.noLegs")}</Text>}>
                  <CycleRing cycle={c()} divine={props.file.divine} icons={props.icons} class="py-4" />
                </If>
              </AccordionItem>
            )}
          </Each>
        </Accordion>
      </If>
    </View>
  );
}

const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

export function Opportunities() {
  const show = signal<Show>("all");
  const risk = signal<RiskFilter>("any");
  // Again whenever an update brings a new market.
  const data = resource(engine.version, () => fetchOpportunities());
  // The pictures come with the market's rows: each dip's item, and every item a cycle goes through.
  const icons = resource(
    () => data(),
    (file) => itemIcons([...file.opportunities.map((o) => o.itemId), ...file.cycles.flatMap((c) => c.ids)]),
  );
  const shown = () => {
    const file = data();
    if (!file || show() === "cycle") return [];
    const max = risk() === "low" ? 0 : risk() === "medium" ? 1 : 2;
    return file.opportunities.filter((o) => (show() === "all" || o.type === show()) && RISK_ORDER[o.risk] <= max);
  };
  const subtitle = () => {
    const file = data();
    if (!file) return t("common.loading");
    return t("common.updated", { league: file.league, ago: ago(file.at), divine: Math.round(file.divine) });
  };
  return (
    <Page
      title={t("opp.title")}
      subtitle={subtitle()}
      scroll={false}
      testID="page-opportunities"
      actions={
        <>
          <Segmented
            label={t("opp.type")}
            value={show()}
            onChange={(v) => show.set(v)}
            items={[
              { value: "all", label: t("opp.all") },
              { value: "dip", label: t("opp.dip") },
              { value: "cycle", label: t("opp.cycle") },
            ]}
          />
          <Select
            label={t("opp.risk")}
            value={risk()}
            onChange={(v) => risk.set(v as RiskFilter)}
            class="w-32"
            options={[
              { value: "any", title: t("opp.anyRisk") },
              { value: "medium", title: t("opp.upToMedium") },
              { value: "low", title: t("opp.lowOnly") },
            ]}
          />
        </>
      }
      footer={<Disclaimer />}
    >
      <If when={!data.error()} else={<ErrorState message={errorText(data.error())} onRetry={() => retry(data)} />}>
        <If when={data()} else={<View class="p-4"><SkeletonList rows={5} rowClass="h-24 rounded-(--radius-lg)" /></View>}>
          {(file) => (
            <List
              each={shown()}
              keyExtractor={(o) => o.id}
              class="flex-1"
              contentClass="px-4"
              header={<View class="h-3" />}
              empty={
                <If when={show() !== "cycle"}>
                  <Empty
                    icon="sparkles"
                    title={t("opp.none")}
                    description={t("opp.noneHint")}
                  />
                </If>
              }
              footer={<If when={show() !== "dip"}><Cycles file={file()} icons={icons()} /></If>}
            >
              {(o, i) => <OpportunityCard item={o()} divine={file().divine} index={i()} icon={icons()?.get(o().itemId)} />}
            </List>
          )}
        </If>
      </If>
    </Page>
  );
}
