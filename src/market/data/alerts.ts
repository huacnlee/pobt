// Checks the watchlist's alerts against the latest prices, and the opportunity types followed for new ones, and
// notifies: after each update computes a new market, and on a timer while the app runs (which also starts the hourly
// update when it is due). Nothing runs while the app is closed.
import { Notifications } from "nsh";
import { itemName, t } from "./i18n";
import { trim } from "../ui/format";
import { crossings, newOpportunities, seenOpportunities, settings, updateWatch, watchlist } from "./local";
import { ensureFresh, onComputed } from "./engine";
import { fetchOpportunities, fetchRows } from "./market";
import { opportunityTitle } from "./phrase";
import type { Kind } from "./types";
import { go, openOpportunity } from "../nav";

/** The latest prices of the watched items, by id. */
export async function watchedPrices(): Promise<Map<string, number>> {
  const kinds = [...new Set(watchlist().map((w) => w.kind))] as Kind[];
  const prices = new Map<string, number>();
  const ids = new Set(watchlist().map((w) => w.id));
  for (const kind of kinds) {
    const file = await fetchRows(kind);
    for (const r of file.rows) if (ids.has(r.id)) prices.set(r.id, r.chaos);
  }
  return prices;
}

/** Notifies the alerts a price crossed, and re-arms those whose price went back. */
export async function checkAlerts(): Promise<number> {
  if (!watchlist().some((w) => w.alertsOn)) return 0;
  const prices = await watchedPrices();
  for (const w of watchlist()) {
    const chaos = prices.get(w.id);
    if (w.firedAt === undefined || chaos === undefined) continue;
    const still = (w.above !== undefined && chaos >= w.above) || (w.below !== undefined && chaos <= w.below);
    if (!still) updateWatch(w.id, { firedAt: undefined });
  }
  const fired = crossings(watchlist(), prices);
  if (fired.length && (await Notifications.permission().catch(() => "denied")) === "granted") {
    for (const f of fired) {
      await Notifications.show({
        id: `alert:${f.watch.id}`,
        title: t(f.direction === "above" ? "watch.alertTitleUp" : "watch.alertTitleDown", { item: itemName(f.watch.name), price: trim(f.chaos) }),
        body: t(f.direction === "above" ? "watch.alertBodyUp" : "watch.alertBodyDown", {
          price: trim((f.direction === "above" ? f.watch.above : f.watch.below)!),
        }),
      }).catch(() => false);
    }
  }
  for (const f of fired) updateWatch(f.watch.id, { firedAt: f.chaos });
  return fired.length;
}

/** More new opportunities than this at one look notify as one, naming the first few. */
const ONE_BY_ONE = 3;

/** Notifies the opportunities of the types followed that appeared since the last look (each once). The first look
 * after a type is turned on takes in what is listed then without notifying. */
export async function checkOpportunityAlerts(): Promise<number> {
  const alerts = settings().oppAlerts;
  if (!alerts?.dip && !alerts?.cycle) {
    if (seenOpportunities().primed.length) seenOpportunities.set({ ...seenOpportunities(), primed: [] });
    return 0;
  }
  const file = await fetchOpportunities();
  const { fresh, seen } = newOpportunities(file.opportunities, alerts, seenOpportunities());
  seenOpportunities.set(seen);
  if (fresh.length && (await Notifications.permission().catch(() => "denied")) === "granted") {
    const body = (o: (typeof fresh)[number]) =>
      t("watch.oppAlertBody", { profit: trim(o.profit), roi: Math.round(o.roi * 100), risk: t(`risk.${o.risk}`) });
    if (fresh.length <= ONE_BY_ONE) {
      for (const o of fresh) {
        await Notifications.show({ id: `opp:${o.id}`, title: t("watch.oppAlertTitle", { title: opportunityTitle(o) }), body: body(o) }).catch(() => false);
      }
    } else {
      await Notifications.show({
        id: "opp:many",
        title: t("watch.oppAlertMany", { n: fresh.length }),
        body: fresh.slice(0, ONE_BY_ONE).map(opportunityTitle).join(" · "),
      }).catch(() => false);
    }
  }
  return fresh.length;
}

let timer: ReturnType<typeof setInterval> | undefined;
let listening = false;

/** Both kinds of alert, the prices' and the opportunities'; how many notified. */
export async function checkAll(): Promise<number> {
  const [prices, opportunities] = await Promise.all([checkAlerts().catch(() => 0), checkOpportunityAlerts().catch(() => 0)]);
  return prices + opportunities;
}

/** Checks after each update, and every `settings().refreshMinutes` while the app runs; again when the setting changes. */
export function startAlerts() {
  if (timer) clearInterval(timer);
  const minutes = Math.max(5, settings().refreshMinutes);
  // The timer is the app in use: an update starts when the hour has passed, and its end checks the alerts.
  timer = setInterval(() => ensureFresh().then(checkAll), minutes * 60_000);
  checkAll();
  if (!listening) {
    listening = true;
    onComputed(() => checkAll());
    // A new opportunity's notification opens it; "many" opens the list.
    Notifications.on("press", ({ id }) => {
      if (!id.startsWith("opp:")) return;
      go("opportunities");
      if (id !== "opp:many") openOpportunity(id.slice(4));
    });
  }
}

export async function askNotifications(): Promise<boolean> {
  const now = await Notifications.permission().catch(() => "denied" as const);
  if (now === "granted") return true;
  if (now === "denied") return false;
  return (await Notifications.requestPermission().catch(() => "denied")) === "granted";
}
