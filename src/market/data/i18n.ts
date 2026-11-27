// The market's words and how it names items. Words are `t()` keys in locales/ (en, zh), in POBT's language (the
// launcher's, set with `setLocale` by src/editor/i18n.ts); item names come from poe.ninja in English and show in
// Chinese as Tencent's servers name them (names.zh-CN.json, made by scripts/tencent-names.ts), loaded the first time
// Chinese shows.
import { effect, locale, signal } from "nsh";
import { t } from "nsh/i18n";
import namesUrl from "./names.zh-CN.json?url";

export { t };

/** A market page's name (poe.ninja's category, such as `DivinationCard`) in the app's language. */
export function categoryLabel(category: string): string {
  const key = `category.${category}`;
  const label = t(key);
  return label === key ? category : label;
}

/** An influence (`Shaper`…) in the app's language. */
export function influenceLabel(influence: string): string {
  const key = `influence.${influence}`;
  const label = t(key);
  return label === key ? influence : label;
}

/** Whether the app shows simplified Chinese now: Tencent's names are the China realm's. */
export const isChinese = () => /^zh(-cn|-hans|$)/.test(locale().toLowerCase());

const zhNames = signal<Record<string, string> | null>(null);
let loading = false;

/** Loads the Chinese names whenever Chinese shows (call once). */
export function followLanguage() {
  effect(() => {
    if (!isChinese() || loading) return;
    loading = true;
    fetch(namesUrl)
      .then((r) => r.json())
      .then((names: Record<string, string>) => zhNames.set(names))
      .catch(() => (loading = false));
  });
}

/** An item's name in the app's language (English from poe.ninja; Tencent's name in Chinese). Reactive. */
export function itemName(english: string): string {
  if (!isChinese()) return english;
  const names = zhNames();
  if (!names) return english;
  const own = names[english];
  if (own) return own;
  if (english.startsWith("Foulborn ")) {
    const base = names[english.slice(9)];
    if (base) return t("names.foulborn", { name: base });
  }
  return english;
}

/** What a search matches an item by: its English name and, in Chinese, its Chinese one. */
export function searchText(english: string): string {
  const zh = isChinese() ? itemName(english) : "";
  return zh === english ? english : `${english} ${zh}`;
}
