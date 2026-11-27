// Writes a Path of Exile 1 item filter (.filter) from a snapshot: every item it has a price for is put in a tier by
// what it is worth (value.ts), and each tier always looks and sounds the same, so the eye learns it.
//
// - Currency and cards go by the stack on the ground: `StackSize >=` the stack worth each tier, so one Orb of
//   Alteration hides and a stack of them shows.
// - Uniques: a filter sees the base type, not the unique. A base is tiered by the median of its uniques, but never more
//   than two tiers under its best one, so a base with one prize among junk (Headhunter's belt) still gets a look.
// - Crafting bases: by base type, item level and influence, only those worth picking once the time to sell is counted.
// - Items it has no price for are left to the game's look: nothing unknown is hidden.

import type { Price, Snapshot } from "./types";
import { DEFAULT_MODEL, type Priced, type ValueModel, stackFor, worth } from "./value";

/** What the filter reads of a price. */
export type FilterPrice = Priced & Pick<Price, "itemLevel" | "influence">;

/** What the filter is made from: a snapshot, or the much smaller `filterInput` of one. */
export interface FilterInput {
  league: string;
  at: string;
  divine: number;
  prices: FilterPrice[];
}

/**
 * Where a character is in the game, which decides what is worth picking up:
 *
 * - `campaign`: levels 0–70, the story. Every currency shows (scrolls are needed), every unique, and what helps level:
 *   4-links, small RGB items, flasks.
 * - `maps`: levels 70–90, maps from tier 1 to 16. Single currency worth under a chaos hides; poor uniques show quietly.
 * - `endgame`: level 90 and on. Cheap cards hide too, and normal and magic gear.
 * - `farming`: a finished build farming what is worth a lot: rares hide as well, and uniques worth nothing.
 */
export type Stage = "campaign" | "maps" | "endgame" | "farming";

export const STAGES: Stage[] = ["campaign", "maps", "endgame", "farming"];

export interface FilterOptions {
  stage?: Stage;
  /** The player's own sound files by tier; without them, the game's alert sounds. */
  sounds?: CustomSounds;
  /** Chaos below which a drop is not worth bending over for; by default the stage's. */
  minWorth?: number;
  model?: ValueModel;
}

/** Below this, a drop is not worth picking up, by stage. */
export const MIN_WORTH: Record<Stage, number> = { campaign: 0.2, maps: 1, endgame: 5, farming: 20 };

/** The lowest threshold a filter of one's own may have (the API's `minWorth`). */
export const LOWEST_WORTH = 0.1;

/** What each stage hides beyond the worth of a drop. */
const STAGE_RULES: Record<Stage, { hideCurrency: boolean; hideCards: boolean; otherUniques: "show" | "quiet" | "hide"; hideGear: string | null; leveling: boolean }> = {
  campaign: { hideCurrency: false, hideCards: false, otherUniques: "show", hideGear: null, leveling: true },
  maps: { hideCurrency: true, hideCards: false, otherUniques: "quiet", hideGear: null, leveling: false },
  endgame: { hideCurrency: true, hideCards: true, otherUniques: "quiet", hideGear: "Rarity <= Magic", leveling: false },
  farming: { hideCurrency: true, hideCards: true, otherUniques: "hide", hideGear: "Rarity <= Rare", leveling: false },
};

/** The item classes of gear: what the later stages hide when nothing above showed it. */
const GEAR = [
  "Amulets", "Rings", "Belts", "Body Armours", "Boots", "Gloves", "Helmets", "Shields", "Quivers", "Bows", "Claws",
  "Daggers", "Rune Daggers", "One Hand Axes", "One Hand Maces", "One Hand Swords", "Thrusting One Hand Swords",
  "Sceptres", "Staves", "Warstaves", "Two Hand Axes", "Two Hand Maces", "Two Hand Swords", "Wands",
];

/** Under this area level, the campaign's leveling rules apply: the story ends at 67. */
const CAMPAIGN_AREA = 68;

/** The tiers, best first. `at` is the chaos a drop must be worth; "divine" is a divine orb's price. */
export interface Tier {
  id: number;
  label: string;
  at: number;
}

export function tiers(divine: number, minWorth: number): Tier[] {
  // "1 divine" starts a little under its price, so a divine orb, worth a hair less once sold, is still the top tier.
  const top = divine * 0.9;
  // Best first, whatever a divine is worth this league (it could fall under 20 c).
  const steps = [...new Set([top, 20, 5].filter((at) => at > minWorth))].sort((a, b) => b - a);
  steps.push(minWorth);
  return steps.map((at, i) => ({
    id: i + 1,
    at,
    label: i === 0 ? (at === top ? "1 divine+" : `${fmt(at)} c+`) : `${fmt(at)} c – ${steps[i - 1] === top ? "1 divine" : `${fmt(steps[i - 1])} c`}`,
  }));
}

/** The sound of each tier with the game's own sounds. */
const GAME_SOUND: Record<number, string> = { 1: "PlayAlertSound 6 300", 2: "PlayAlertSound 1 250", 3: "PlayAlertSound 2 150" };

/**
 * The player's own sound files, one a tier (best first), as paths from the filter's folder (`音效\\神圣石.mp3`).
 * POBT ships no sounds: these are files the player already has there. A tier with none keeps the game's sound.
 */
export type CustomSounds = [string?, string?, string?];

/** A path the game reads after `CustomAlertSound`: no quotes or line breaks, a sound file, never leaving the folder. */
export function validSound(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 200 &&
    !/["\r\n]/.test(path) &&
    !/(^|[\\/])\.\.([\\/]|$)/.test(path) &&
    !/^([a-z]:|[\\/])/i.test(path) &&
    /\.(mp3|wav|ogg)$/i.test(path)
  );
}

/**
 * A filter with the player's sounds in place of the game's: `CustomAlertSound "<path>"` for each tier given, at the
 * same volume, and the game's drop sound off there. The game plays them from the filter's folder.
 */
export function withCustomSounds(text: string, sounds: CustomSounds): string {
  let out = text;
  for (const [tier, line] of Object.entries(GAME_SOUND)) {
    const path = sounds[Number(tier) - 1];
    if (!path || !validSound(path)) continue;
    const volume = line.split(" ").pop();
    out = out.replaceAll(`  ${line}\n`, `  CustomAlertSound "${path}" ${volume}\n  DisableDropSound\n`);
  }
  return out;
}

/** The look of each tier: the same for every kind of item. */
const STYLE: Record<number, string[]> = {
  1: [
    "SetFontSize 45",
    "SetTextColor 255 0 0 255",
    "SetBorderColor 255 0 0 255",
    "SetBackgroundColor 255 255 255 255",
    GAME_SOUND[1],
    "PlayEffect Red",
    "MinimapIcon 0 Red Star",
  ],
  2: [
    "SetFontSize 42",
    "SetTextColor 0 0 0 255",
    "SetBorderColor 0 0 0 255",
    "SetBackgroundColor 240 140 40 255",
    GAME_SOUND[2],
    "PlayEffect Orange",
    "MinimapIcon 0 Orange Diamond",
  ],
  3: [
    "SetFontSize 38",
    "SetTextColor 0 0 0 255",
    "SetBorderColor 0 0 0 255",
    "SetBackgroundColor 235 220 110 255",
    GAME_SOUND[3],
    "PlayEffect Yellow Temp",
    "MinimapIcon 1 Yellow Circle",
  ],
  4: ["SetFontSize 34", "SetTextColor 230 230 230 255", "SetBorderColor 150 150 150 255", "SetBackgroundColor 40 40 40 230"],
};

/** Uniques under the threshold: shown, as the game would, but small and with nothing to call the eye. */
const QUIET_UNIQUE = ["SetFontSize 28", "SetTextColor 175 96 37 200", "SetBorderColor 0 0 0 0", "SetBackgroundColor 0 0 0 160"];

/** The biggest stack that drops on the ground: a rule for more would never show. Lifeforce drops in hundreds. */
function maxDropStack(price: FilterPrice): number {
  if (price.kind === "card") return 10;
  return /Lifeforce/.test(price.baseType) ? 5000 : 100;
}

interface Rule {
  show: boolean;
  comment: string;
  conditions: string[];
  style: string[];
}

export function generateFilter(snapshot: FilterInput, options: FilterOptions = {}): string {
  const stage = options.stage ?? "maps";
  const minWorth = options.minWorth ?? MIN_WORTH[stage];
  const model = options.model ?? DEFAULT_MODEL;
  const levels = tiers(snapshot.divine, minWorth);
  const rules = [
    ...(STAGE_RULES[stage].leveling ? levelingRules() : []),
    ...stackRules(snapshot.prices, levels, stage, minWorth, model),
    ...uniqueRules(snapshot.prices, levels, stage, model),
    ...baseRules(snapshot.prices, levels, model),
    ...gearRules(stage),
  ];
  const head = [
    `# POBT smart loot filter for Path of Exile — ${snapshot.league}`,
    `# Prices of ${snapshot.at}; 1 divine = ${fmt(snapshot.divine)} c.`,
    `# Stage: ${stage}; not worth picking up below ${fmt(minWorth)} c.`,
    `# Tiers by worth (price × stack × liquidity − cost to sell): ${levels.map((t) => t.label).join(", ")}.`,
    "# Items without a price are left as the game shows them. Generated by POBT.",
  ];
  const text = `${head.join("\n")}\n\n${rules.map(render).join("\n\n")}\n`;
  return options.sounds ? withCustomSounds(text, options.sounds) : text;
}

function render(rule: Rule): string {
  return [`# ${rule.comment}`, rule.show ? "Show" : "Hide", ...[...rule.conditions, ...rule.style].map((l) => `  ${l}`)].join("\n");
}

function names(list: string[]): string {
  return [...new Set(list)]
    .sort()
    .map((name) => `"${name.replaceAll('"', "")}"`)
    .join(" ");
}

/** Currency and cards: one rule per tier and stack size, best tier first, then the singles not worth it hidden. */
function stackRules(prices: FilterPrice[], levels: Tier[], stage: Stage, minWorth: number, model: ValueModel): Rule[] {
  const { hideCurrency, hideCards } = STAGE_RULES[stage];
  const stackable = prices.filter((p) => p.kind === "currency" || p.kind === "card");
  const groups = new Map<string, { tier: Tier; stack: number; kind: string; names: string[] }>();
  const hidden: Record<string, string[]> = { currency: [], card: [] };
  for (const price of stackable) {
    for (const tier of levels) {
      const stack = stackFor(price, tier.at, model);
      if (stack === undefined || stack > maxDropStack(price)) continue;
      const key = `${tier.id}:${stack}:${price.kind}`;
      const group = groups.get(key) ?? { tier, stack, kind: price.kind, names: [] };
      group.names.push(price.baseType);
      groups.set(key, group);
      if (stack === 1) break; // one already reaches this tier: lower tiers would never match
    }
    // No one trades it: no price to go by, so it is left alone.
    if (!((price.volume ?? price.listings) > 0)) continue;
    // One is not worth it: hide the one (a stack that is shows by its tier above), as far as the stage hides that
    // kind. Up to farming, anything worth a chaos orb alone always shows.
    const below = stage === "farming" ? minWorth : Math.min(minWorth, 1);
    if (worth(price, 1, model) < below && (price.kind === "currency" ? hideCurrency : hideCards)) {
      hidden[price.kind].push(price.baseType);
    }
  }
  const shown = [...groups.values()]
    .sort((a, b) => a.tier.id - b.tier.id || b.stack - a.stack || a.kind.localeCompare(b.kind))
    .map((g) => ({
      show: true,
      comment: `${g.kind === "card" ? "Cards" : "Currency"}, tier ${g.tier.id} (${g.tier.label})${g.stack > 1 ? `, stacks of ${g.stack}+` : ""}`,
      conditions: [...(g.stack > 1 ? [`StackSize >= ${g.stack}`] : []), `BaseType == ${names(g.names)}`],
      style: STYLE[g.tier.id],
    }));
  const hide = (["currency", "card"] as const)
    .filter((kind) => hidden[kind].length > 0)
    .map((kind) => ({
      show: false,
      comment: `${kind === "card" ? "Cards" : "Currency"} not worth picking up alone`,
      conditions: [`BaseType == ${names(hidden[kind])}`],
      style: [],
    }));
  return [...shown, ...hide];
}

/** Uniques by base type: the median unique's tier, at most two tiers under the best unique on it. */
export function uniqueTiers(prices: FilterPrice[], levels: Tier[], model: ValueModel = DEFAULT_MODEL): Map<string, Tier> {
  const byBase = new Map<string, number[]>();
  for (const price of prices) {
    if (price.kind !== "unique") continue;
    byBase.set(price.baseType, [...(byBase.get(price.baseType) ?? []), worth(price, 1, model)]);
  }
  // The index of the tier a worth reaches; levels.length when it reaches none.
  const tierOf = (chaos: number) => {
    const i = levels.findIndex((t) => chaos >= t.at);
    return i === -1 ? levels.length : i;
  };
  const result = new Map<string, Tier>();
  for (const [base, values] of byBase) {
    values.sort((a, b) => a - b);
    let index = tierOf(values[Math.floor((values.length - 1) / 2)]);
    index = Math.min(index, tierOf(values[values.length - 1]) + 2);
    if (index < levels.length) result.set(base, levels[index]);
  }
  return result;
}

function uniqueRules(prices: FilterPrice[], levels: Tier[], stage: Stage, model: ValueModel): Rule[] {
  const byTier = new Map<number, string[]>();
  for (const [base, tier] of uniqueTiers(prices, levels, model)) byTier.set(tier.id, [...(byTier.get(tier.id) ?? []), base]);
  const rules: Rule[] = levels
    .filter((tier) => byTier.has(tier.id))
    .map((tier) => ({
      show: true,
      comment: `Uniques, tier ${tier.id} (${tier.label}) by base type`,
      conditions: ["Rarity Unique", `BaseType == ${names(byTier.get(tier.id)!)}`],
      style: STYLE[tier.id],
    }));
  // The rest: a filter cannot tell an unknown unique from junk, so they show, quietly once leveling is over; farming
  // has no time for them.
  const other = STAGE_RULES[stage].otherUniques;
  if (other === "quiet") {
    rules.push({ show: true, comment: "Other uniques: not worth selling", conditions: ["Rarity Unique"], style: QUIET_UNIQUE });
  } else if (other === "hide") {
    rules.push({ show: false, comment: "Other uniques: not worth the time when farming", conditions: ["Rarity Unique"], style: [] });
  }
  return rules;
}

/** The campaign: what helps a character level, until the story ends. */
function levelingRules(): Rule[] {
  const area = `AreaLevel < ${CAMPAIGN_AREA}`;
  const upgrade = ["SetFontSize 36", "SetBorderColor 120 180 255 255", "MinimapIcon 2 Blue Square"];
  return [
    { show: true, comment: "Leveling: 4 or more linked sockets", conditions: [area, "LinkedSockets >= 4"], style: upgrade },
    {
      show: true,
      comment: "Leveling: red, green and blue linked on a small item (the chromatic orb recipe)",
      conditions: [area, "SocketGroup RGB", "Width <= 2", "Height <= 2"],
      style: ["SetBorderColor 200 200 200 200"],
    },
    {
      show: true,
      comment: "Leveling: flasks",
      conditions: [area, 'Class == "Life Flasks" "Mana Flasks" "Hybrid Flasks" "Utility Flasks"'],
      style: ["SetFontSize 32"],
    },
  ];
}

/** Gear nothing above showed: the later stages hide what they have no use for, keeping influenced and 6-link items. */
function gearRules(stage: Stage): Rule[] {
  const rarity = STAGE_RULES[stage].hideGear;
  if (!rarity) return [];
  return [
    {
      show: false,
      comment: `Gear not worth picking up at this stage (${rarity.replace("Rarity <= ", "up to ")})`,
      conditions: [rarity, "HasInfluence None", "LinkedSockets <= 5", "Mirrored False", `Class == ${names(GEAR)}`],
      style: [],
    },
  ];
}

/** Crafting bases worth picking, by item level and influence; best first, so higher item levels match first. */
function baseRules(prices: FilterPrice[], levels: Tier[], model: ValueModel): Rule[] {
  const groups = new Map<string, { tier: Tier; ilvl: number; influence: string; names: string[] }>();
  for (const price of prices) {
    if (price.kind !== "base") continue;
    const value = worth(price, 1, model);
    const tier = levels.find((t) => value >= t.at);
    if (!tier) continue;
    const ilvl = price.itemLevel ?? 1;
    const influence = price.influence ?? "None";
    const key = `${tier.id}:${ilvl}:${influence}`;
    const group = groups.get(key) ?? { tier, ilvl, influence, names: [] };
    group.names.push(price.baseType);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.tier.id - b.tier.id || b.ilvl - a.ilvl || a.influence.localeCompare(b.influence))
    .map((g) => ({
      show: true,
      comment: `Crafting bases, tier ${g.tier.id} (${g.tier.label}), item level ${g.ilvl}+, ${g.influence === "None" ? "no influence" : g.influence}`,
      conditions: [
        "Rarity <= Rare",
        `ItemLevel >= ${g.ilvl}`,
        `HasInfluence ${g.influence}`,
        `BaseType == ${names(g.names)}`,
      ],
      style: STYLE[g.tier.id],
    }));
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 1 : 0);
}

/**
 * Only what `generateFilter` reads of a snapshot, for a filter made on request (`/api/filters/custom.filter`), with the
 * default model and a threshold of at least `LOWEST_WORTH`: the same filter, byte for byte, from a file a tenth the
 * size. The fields it never reads go (names, ids, icons, sparklines, pairs), and the crafting bases worth less than
 * `LOWEST_WORTH`, most of them: no tier reaches down to them.
 */
export function filterInput(snapshot: Snapshot): FilterInput {
  const prices: FilterPrice[] = [];
  for (const p of snapshot.prices) {
    if (p.kind === "base" && !(worth(p) >= LOWEST_WORTH)) continue;
    prices.push({
      kind: p.kind,
      baseType: p.baseType,
      chaos: p.chaos,
      listings: p.listings,
      volume: p.volume,
      change7d: p.change7d,
      itemLevel: p.itemLevel,
      influence: p.influence,
    });
  }
  return { league: snapshot.league, at: snapshot.at, divine: snapshot.divine, prices };
}
