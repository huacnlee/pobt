import { locale } from "nsh";
import { t } from "../data/i18n";

// How the app writes numbers: chaos and divine, changes, hours. Every number in the UI goes through these.

/** A price in chaos, with `div` once it is worth a divine or more. */
export function price(chaos: number, divine?: number): string {
  if (divine && divine > 0 && chaos >= divine) return `${trim(chaos / divine)} div`;
  return `${trim(chaos)} c`;
}

/** Chaos only, signed: a profit or a loss. */
export function signedChaos(chaos: number): string {
  return `${chaos > 0 ? "+" : chaos < 0 ? "−" : ""}${trim(Math.abs(chaos))} c`;
}

/** A change in percent, signed, with − as the minus sign. */
export function percent(change: number | undefined): string {
  if (change === undefined || !Number.isFinite(change)) return "—";
  const abs = Math.abs(change);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 1;
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${abs.toFixed(digits)}%`;
}

export function trim(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1).replace(/\.0$/, "");
  if (abs >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toPrecision(2).replace(/\.?0+$/, "");
}

/** About how long a sale takes. */
export function hours(h: number): string {
  if (h < 1) return t("time.withinHour");
  if (h < 24) return t("time.hours", { n: Math.round(h) });
  return t("time.days", { n: Math.round(h / 24) });
}

/** How long ago, from an ISO time. */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  if (minutes < 60 * 24) return t("time.hoursAgo", { n: Math.round(minutes / 60) });
  return t("time.daysAgo", { n: Math.round(minutes / 1440) });
}

/** A day, `2026-11-27`, as the language writes it (`11月27日`, `Nov 27`). */
export function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), { month: "short", day: "numeric", timeZone: "UTC" });
}

/** A size in bytes, as a file manager writes it: `840 KB`, `3.9 MB`. */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
