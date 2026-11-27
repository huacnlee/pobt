import { describe, expect, test } from "bun:test";
import { LOWEST_WORTH, STAGES, filterInput, generateFilter, tiers, uniqueTiers, validSound } from "../filter";
import type { Snapshot } from "../types";
import { SNAPSHOT } from "./fixture";

/** The blocks of a filter, each as its lines without indentation. */
const blocks = (filter: string) =>
  filter
    .split("\n\n")
    .slice(1)
    .map((b) => b.split("\n").map((l) => l.trim()));
const blockWith = (filter: string, ...lines: string[]) =>
  blocks(filter).find((b) => lines.every((l) => b.some((x) => x.includes(l))));

describe("tiers", () => {
  test("four by default, the lowest at the threshold", () => {
    expect(tiers(150, 1).map((t) => [t.at, t.label])).toEqual([
      [135, "1 divine+"],
      [20, "20 c – 1 divine"],
      [5, "5 c – 20 c"],
      [1, "1 c – 5 c"],
    ]);
  });
  test("best first even when a divine is cheap", () => {
    expect(tiers(15, 1).map((t) => t.at)).toEqual([20, 13.5, 5, 1]);
  });
  test("a high threshold drops the tiers under it", () => {
    expect(tiers(150, 30).map((t) => t.at)).toEqual([135, 30]);
  });
});

describe("generateFilter", () => {
  const filter = generateFilter(SNAPSHOT);

  test("a single cheap orb hides, a stack of them shows", () => {
    const all = blocks(filter).map((b) => b.join("\n"));
    const hide = all.findIndex((b) => b.includes("Hide") && b.includes('"Orb of Alteration"'));
    const show = all.findIndex((b) => b.includes("StackSize >=") && b.includes('"Orb of Alteration"'));
    expect(hide).toBeGreaterThan(-1);
    expect(show).toBeGreaterThan(-1);
    expect(show).toBeLessThan(hide);
  });

  test("lifeforce goes up a tier as its stack grows", () => {
    const stacks = blocks(filter)
      .filter((b) => b.some((l) => l.includes("Vivid Crystallised Lifeforce")) && b[1] === "Show")
      .map((b) => Number(b.find((l) => l.startsWith("StackSize"))!.split(" ").pop()));
    expect(stacks.length).toBeGreaterThanOrEqual(3);
    expect([...stacks].sort((a, b) => b - a)).toEqual(stacks);
  });

  test("dear currency and cards always show in the top tier", () => {
    const divine = blockWith(filter, "tier 1", '"Divine Orb"')!;
    expect(divine).toBeDefined();
    expect(divine.some((l) => l.startsWith("StackSize"))).toBe(false);
    expect(blockWith(filter, "tier 1", '"The Doctor"')).toBeDefined();
    expect(blockWith(filter, "Hide", "Divine Orb")).toBeUndefined();
    expect(blocks(filter).filter((b) => b.includes('BaseType == "Divine Orb"'))).toHaveLength(1);
  });

  test("a single Chaos Orb shows at every stage up to farming", () => {
    expect(blockWith(filter, "Hide", '"Chaos Orb"')).toBeUndefined();
    expect(generateFilter(SNAPSHOT, { stage: "endgame" })).not.toMatch(/Hide\n[^\n]*"Chaos Orb"/);
  });

  test("what nobody trades is never hidden", () => {
    expect(blockWith(filter, "Chaos Shard")).toBeUndefined();
  });

  test("cheap cards hide from the endgame on", () => {
    expect(blockWith(filter, "Hide", "Rain of Chaos")).toBeUndefined();
    expect(blockWith(generateFilter(SNAPSHOT, { stage: "endgame" }), "Hide", "Rain of Chaos")).toBeDefined();
  });

  test("the player's own sounds in place of the game's, by tier; a tier without one keeps the game's", () => {
    const custom = generateFilter(SNAPSHOT, { sounds: ["音效\\神圣石.mp3", undefined, "音效/卡片.mp3"] });
    expect(blockWith(custom, "tier 1", '"Divine Orb"')).toContain('CustomAlertSound "音效\\神圣石.mp3" 300');
    expect(custom).toContain("PlayAlertSound 1 250");
    expect(custom).toContain('CustomAlertSound "音效/卡片.mp3" 150');
    expect(filter).toContain("PlayAlertSound 6 300");
  });

  test("a sound path stays in the filter's folder and cannot break the file", () => {
    expect(validSound("音效\\神圣石.mp3")).toBe(true);
    for (const bad of ['a".mp3', "../x.mp3", "C:\\x.mp3", "/x.mp3", "x.exe", "a\nShow.mp3"]) expect(validSound(bad)).toBe(false);
  });

  test("the campaign shows every currency and what helps level", () => {
    const campaign = generateFilter(SNAPSHOT, { stage: "campaign" });
    expect(campaign).not.toMatch(/^Hide/m);
    expect(blockWith(campaign, "LinkedSockets >= 4")).toBeDefined();
    expect(blockWith(campaign, "AreaLevel < 68")).toBeDefined();
    expect(blockWith(filter, "AreaLevel")).toBeUndefined();
  });

  test("later stages hide plain gear; farming hides rares and worthless uniques", () => {
    expect(blockWith(filter, "Hide", "Rarity <= Magic")).toBeUndefined();
    expect(blockWith(generateFilter(SNAPSHOT, { stage: "endgame" }), "Hide", "Rarity <= Magic")).toBeDefined();
    const farming = generateFilter(SNAPSHOT, { stage: "farming" });
    expect(blockWith(farming, "Hide", "Rarity <= Rare", "HasInfluence None")).toBeDefined();
    expect(farming).toMatch(/Hide\n  Rarity Unique$/m);
  });

  test("a unique base with one prize shows two tiers under it; junk uniques are quiet, never hidden", () => {
    const levels = tiers(150, 1);
    const byBase = uniqueTiers(SNAPSHOT.prices, levels);
    expect(byBase.get("Leather Belt")?.id).toBe(3);
    expect(byBase.get("Heavy Belt")?.id).toBe(1);
    expect(byBase.has("Leather Cap")).toBe(false);
    expect(byBase.has("Gold Ring")).toBe(false);
    expect(blockWith(filter, "Other uniques", "Rarity Unique")).toBeDefined();
    expect(filter).not.toMatch(/Hide\n\s+Rarity Unique/);
  });

  test("crafting bases by item level and influence; a cheap one gets no rule", () => {
    const block = blockWith(filter, "Hubris Circlet")!;
    expect(block).toContain("ItemLevel >= 86");
    expect(block).toContain("HasInfluence Shaper");
    expect(blockWith(filter, "ItemLevel >= 84")).toBeUndefined();
  });

  test("every block is Show or Hide followed by conditions and actions", () => {
    for (const b of blocks(filter)) {
      expect(b[0].startsWith("#")).toBe(true);
      expect(["Show", "Hide"]).toContain(b[1]);
      expect(b.length).toBeGreaterThan(2);
    }
  });
});

describe("the filter's input for a threshold of one's own", () => {
  // Bases around the cut (worth 0.1 at about 3.92 c with these listings), with item levels and influences.
  const near: Snapshot = {
    ...SNAPSHOT,
    prices: [
      ...SNAPSHOT.prices,
      ...Array.from({ length: 40 }, (_, i) => ({
        name: `Base ${i % 7}`,
        baseType: `Base ${i % 7}`,
        kind: "base" as const,
        chaos: 3.8 + i * 0.008,
        listings: 1000,
        change7d: i % 3 ? 0 : 5,
        itemLevel: 82 + (i % 5),
        influence: i % 4 ? undefined : "Elder",
        icon: "gen/image/x.png",
      })),
    ],
  };

  test("makes the same filter, byte for byte, at every threshold, through JSON", () => {
    const input = JSON.parse(JSON.stringify(filterInput(near)));
    const whole = JSON.parse(JSON.stringify(near));
    expect(input.prices.length).toBeLessThan(whole.prices.length);
    for (const minWorth of [LOWEST_WORTH, 0.15, 0.2, 0.5, 1, 3, 5, 20, 100, 135, 1000, 10_000]) {
      for (const stage of STAGES) {
        expect(generateFilter(input, { stage, minWorth })).toBe(generateFilter(whole, { stage, minWorth }));
      }
    }
  });

  test("keeps only what the filter reads", () => {
    const [first] = filterInput(SNAPSHOT).prices;
    expect(Object.keys(JSON.parse(JSON.stringify(first))).sort()).toEqual(["baseType", "chaos", "kind", "listings", "volume"]);
  });
});
