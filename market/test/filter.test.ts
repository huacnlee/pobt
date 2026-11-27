import { describe, expect, test } from "bun:test";
import { countRules, generateFilter, tiers, uniqueTiers } from "../src/filter";
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

  test("a single Chaos Orb always shows", () => {
    expect(blockWith(filter, "Hide", '"Chaos Orb"')).toBeUndefined();
    expect(generateFilter(SNAPSHOT, { strictness: "strict" })).not.toMatch(/Hide\n[^\n]*"Chaos Orb"/);
  });

  test("what nobody trades is never hidden", () => {
    expect(blockWith(filter, "Chaos Shard")).toBeUndefined();
  });

  test("cheap cards hide only when strict", () => {
    expect(blockWith(filter, "Hide", "Rain of Chaos")).toBeUndefined();
    expect(blockWith(generateFilter(SNAPSHOT, { strictness: "strict" }), "Hide", "Rain of Chaos")).toBeDefined();
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

test("counts a filter's rules per tier, as the launcher's page shows them", () => {
  const text = generateFilter(SNAPSHOT);
  const { byTier, total } = countRules(text);
  expect(total).toBe((text.match(/^(Show|Hide)$/gm) ?? []).length);
  const tiered = [...byTier.values()].reduce((a, b) => a + b, 0);
  expect(tiered).toBe((text.match(/^# .*, tier \d+ /gm) ?? []).length);
  expect(byTier.get(1)).toBeGreaterThan(0);
});
