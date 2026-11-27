// Every price of a kind, searchable: the place to look an item up and open it.
import { categoryLabel, influenceLabel, itemName, t } from "../data/i18n";
import { ItemArt } from "../ui/ItemArt";
import { List, resource, signal, Text, View } from "nsh";
import { errorText } from "../data/ninja";
import { engine } from "../data/engine";
import { fetchRows, kindLabel, KINDS, retry, search } from "../data/market";
import type { Kind, Row as MarketRow } from "../data/types";
import { openItem } from "../nav";
import { Sparkline } from "../ui/Chart";
import { ago, hours, price } from "../ui/format";
import { Disclaimer, Page } from "../ui/Page";
import { Change } from "../ui/Stat";
import { Input, Row, Empty, ErrorState, SkeletonList, Segmented } from "../../ui";

function Header() {
  return (
    <View class="h-8 flex-row items-center gap-3 border-b border-border px-2.5">
      <View class="w-8" />
      <Text class="flex-1 text-xs text-muted-foreground">{t("search.item")}</Text>
      <Text class="w-20 text-xs text-muted-foreground">{t("search.week")}</Text>
      <Text class="w-24 text-right text-xs text-muted-foreground">{t("search.price")}</Text>
      <Text class="w-20 text-right text-xs text-muted-foreground">{t("search.day")}</Text>
      <Text class="w-16 text-right text-xs text-muted-foreground">{t("search.liquidity")}</Text>
      <Text class="w-24 text-right text-xs text-muted-foreground">{t("search.sellTime")}</Text>
    </View>
  );
}

function ResultRow(props: { row: MarketRow; divine: number; index: number }) {
  const detail = () => [categoryLabel(props.row.category), props.row.itemLevel ? t("common.level", { level: props.row.itemLevel }) : "", props.row.influence ? influenceLabel(props.row.influence) : ""].filter(Boolean).join(" · ");
  return (
    <Row onPress={() => openItem(props.row.id, props.row.name)} label={itemName(props.row.name)} testID={`row-${props.index}`}>
      <ItemArt icon={props.row.icon} name={props.row.name} size={32} />
      <View class="flex-1 gap-0.5">
        <Text class="text-sm text-foreground line-clamp-1">{itemName(props.row.name)}</Text>
        <Text class="text-xs text-muted-foreground line-clamp-1">{detail()}</Text>
      </View>
      <Sparkline values={props.row.spark} />
      <Text class="w-24 text-right text-sm tabular-nums text-foreground">{price(props.row.chaos, props.divine)}</Text>
      <View class="w-20">
        <Change value={props.row.change1d} />
      </View>
      <Text class="w-16 text-right text-sm tabular-nums text-muted-foreground">{`${Math.round(props.row.liquidity * 100)}%`}</Text>
      <Text class="w-24 text-right text-xs text-muted-foreground">{hours(props.row.sellHours)}</Text>
    </Row>
  );
}

export function Search() {
  const kind = signal<Kind>("currency");
  const query = signal("");
  const rows = resource(() => [kind(), engine.version()] as const, ([k]) => fetchRows(k));
  const found = () => (rows() ? search(rows()!.rows, query()) : []);
  return (
    <Page
      title={t("search.title")}
      subtitle={rows() ? t("search.subtitle", { league: rows()!.league, count: rows()!.rows.length, kind: kindLabel(kind()), ago: ago(rows()!.at) }) : t("common.loading")}
      scroll={false}
      footer={<Disclaimer />}
      testID="page-search"
    >
      <View class="h-12 flex-row items-center gap-3 border-b border-border px-4">
        <Segmented class="self-center" label={t("search.label")} value={kind()} onChange={(k) => kind.set(k)} items={KINDS.map((k) => ({ value: k, label: kindLabel(k) }))} />
        <Input value={query()} onChange={(v) => query.set(v)} placeholder={t("search.placeholder")} icon="search" class="flex-1" accessibilityLabel={t("search.label")} testID="search" />
      </View>
      <If when={!rows.error()} else={<ErrorState message={errorText(rows.error())} onRetry={() => retry(rows)} />}>
        <If when={rows() && !rows.loading()} else={<View class="p-4"><SkeletonList rows={10} rowClass="h-10" /></View>}>
          <View class="flex-1 px-2 pt-1">
            <Header />
            <List
              each={found()}
              keyExtractor={(r) => r.id}
              class="flex-1"
              empty={<Empty icon="search" title={t("search.none")} description={t("search.noneHint")} />}
              footer={<If when={found().length >= 200}><Text class="py-3 text-center text-xs text-muted-foreground">{t("search.first200")}</Text></If>}
            >
              {(r, i) => <ResultRow row={r()} divine={rows()!.divine} index={i()} />}
            </List>
          </View>
        </If>
      </If>
    </Page>
  );
}
