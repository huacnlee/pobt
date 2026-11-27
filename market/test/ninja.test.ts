import { describe, expect, test } from "bun:test";
import { generateFilter } from "../src/filter";
import { parsePage, sources, toSnapshot } from "../src/ninja";
import sample from "./ninja-sample.json";

// A few lines of each kind of page, as poe.ninja sent them for Covens on 2026-11-27.
const currency = parsePage({ market: "exchange", kind: "currency" }, sample.currency);
const cards = parsePage({ market: "exchange", kind: "card" }, sample.cards);
const uniques = parsePage({ market: "stash", kind: "unique" }, sample.uniques);
const bases = parsePage({ market: "stash", kind: "base" }, sample.bases);

describe("parsePage", () => {
  test("the exchange: names from its items, the day's volume in items", () => {
    const alt = currency.find((p) => p.name === "Orb of Alteration")!;
    expect(alt.chaos).toBeCloseTo(0.1877);
    expect(alt.volume).toBeCloseTo(98883 / 0.1877);
    expect(cards.every((p) => p.kind === "card")).toBe(true);
  });

  test("uniques by their base type", () => {
    expect(uniques.length).toBeGreaterThan(0);
    expect(uniques.every((p) => p.kind === "unique" && (p.baseType === "Leather Belt" || p.baseType === "Heavy Belt"))).toBe(true);
  });

  test("bases with item level and one influence; two influences never drop", () => {
    expect(bases.some((p) => p.influence === "Warlord" && p.itemLevel === 85)).toBe(true);
    expect(bases.some((p) => p.influence?.includes("/"))).toBe(false);
  });
});

test("20 pages a league, the league in the query", () => {
  const list = sources("Hardcore Covens");
  expect(list).toHaveLength(20);
  expect(list.every((s) => s.url.includes("league=Hardcore%20Covens"))).toBe(true);
});

test("a filter from real prices: a divine is the top tier", () => {
  const snapshot = toSnapshot("Covens", "2026-11-27T06:00:00Z", [...currency, ...cards, ...uniques, ...bases]);
  expect(snapshot.divine).toBeCloseTo(150.2);
  const filter = generateFilter(snapshot);
  expect(filter).toMatch(/tier 1[^\n]*\nShow\n {2}BaseType == [^\n]*"Divine Orb"/);
});
