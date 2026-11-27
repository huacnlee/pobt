// The market: the PoE1 market from poe.ninja, the trades worth making in it, and a loot filter made from its prices
// (README "Market"). There is no server and no account: it reads poe.ninja while POBT is open, at most once an hour,
// and computes everything here. It starts the first time it is opened, and keeps updating (alerts, the installed
// filter) until POBT quits.
import { signal, Text, View } from "nsh";
import { NavStack } from "nsh/base";
import { startAlerts } from "./data/alerts";
import { checkedAt, engine, startEngine, updateNow } from "./data/engine";
import { installed, startFilterUpdates } from "./data/filter";
import { followLanguage, t } from "./data/i18n";
import { ledger, settings, watchlist } from "./data/local";
import { go, type Route, SECTIONS, type Section, section, stack } from "./nav";
import { Filter } from "./pages/Filter";
import { Item } from "./pages/Item";
import { Ledger } from "./pages/Ledger";
import { Market } from "./pages/Market";
import { Opportunities } from "./pages/Opportunities";
import { OpportunityDetail } from "./pages/OpportunityDetail";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Watchlist } from "./pages/Watchlist";
import { ago } from "./ui/format";
import { IconButton, ProgressBar, Spinner, Tabs, toast } from "../ui";

function Screen(props: { route: Route }) {
  const r = props.route;
  switch (r.page) {
    case "opportunities":
      return <Opportunities />;
    case "opportunity":
      return <OpportunityDetail id={r.id} />;
    case "market":
      return <Market />;
    case "search":
      return <Search />;
    case "item":
      return <Item id={r.id} name={r.name} />;
    case "watchlist":
      return <Watchlist />;
    case "ledger":
      return <Ledger />;
    case "filter":
      return <Filter />;
    case "settings":
      return <Settings />;
  }
}

/** What is kept on the device has loaded and the market has started. */
const ready = signal(false);
let started = false;

/** Starts the market once: what is kept on the device loads first, so the first screen shows it; then the market,
 * the one kept at once and a new one from poe.ninja when it is over an hour old. */
export function startMarket() {
  if (started) return;
  started = true;
  Promise.all([watchlist.ready, ledger.ready, settings.ready, installed.ready]).then(() => {
    followLanguage();
    startEngine();
    startAlerts();
    startFilterUpdates(() => toast(t("filter.autoUpdated")));
    ready.set(true);
  });
}

/**
 * The market's state, at the title bar's end (where the launcher shows POBT's version): while an update runs, how far
 * it is; otherwise the league and how old the prices are, and Refresh.
 */
export function MarketStatus() {
  const text = () => {
    const p = engine.progress();
    if (p) return p.phase === "computing" ? t("update.computing") : t("update.fetching", { done: p.done, total: p.total });
    const m = engine.meta();
    // A failed update leaves the market kept on screen: it says so, and how old that market is.
    if (engine.failure() && m) return t(engine.offline() ? "update.offline" : "update.stale", { ago: ago(checkedAt(m)) });
    if (engine.failure()) return t(engine.offline() ? "update.offlineEmpty" : "update.failed");
    return m ? t("update.status", { league: m.league, ago: ago(checkedAt(m)) }) : "";
  };
  const refresh = async () => {
    const result = await updateNow();
    if (result === "fresh") toast(t("update.fresh"), "info");
    else if (result === "failed" && engine.offline() && engine.meta()) toast(t("update.offlineToast"), "info");
    else if (result === "failed") toast(t("update.failedToast", { error: engine.failure() ?? "" }), "error");
    else toast(t("update.done"));
  };
  return (
    <If when={ready()}>
      <View class="flex-row items-center gap-2" accessibilityLiveRegion="polite" testID="update-status">
        <If when={engine.updating()}>
          <Spinner size="sm" />
        </If>
        <Text class={`text-xs tabular-nums line-clamp-1 ${engine.failure() && !engine.updating() ? "text-warning" : "text-muted-foreground"}`}>{text()}</Text>
        <IconButton icon="refresh-cw" size="sm" label={t("update.refresh")} disabled={engine.updating()} onPress={refresh} testID="update-refresh" />
      </View>
    </If>
  );
}

/** The market under POBT's title bar: its sections as the build editor's page tabs, then the section's pages. Until
 * what is kept has loaded, a bar of unknown length (the build editor's Starting). */
export function MarketView() {
  startMarket();
  return (
    <If
      when={ready()}
      else={
        <View class="flex-1 items-center justify-center bg-background">
          <ProgressBar value={null} class="w-48" accessibilityLabel={t("common.loading")} />
        </View>
      }
    >
      <View class="flex-1 bg-background">
        <Tabs
          label={t("common.navigation")}
          items={SECTIONS.map((i) => ({ value: i.value, label: t(i.label), testID: `nav-${i.value}` }))}
          value={section()}
          onChange={(s: Section) => go(s)}
          class="h-9 border-b border-border bg-background px-2"
        />
        <NavStack state={stack} class="flex-1">
          {(route) => <Screen route={route} />}
        </NavStack>
      </View>
    </If>
  );
}
