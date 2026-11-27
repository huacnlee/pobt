import { describe, expect, test } from "bun:test";
import { generateFilter } from "../filter";
import { CARD_ICON, divineDays, parseDetails, parsePage, sources, toSnapshot } from "../ninja";
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

  test("pictures as paths on the game's CDN", () => {
    expect(currency.find((p) => p.name === "Orb of Alteration")?.icon).toMatch(/^gen\/image\/.+\.png$/);
    expect(uniques.every((p) => p.icon?.startsWith("gen/image/"))).toBe(true);
    // The exchange gives cards no picture: they all share the inventory's card.
    expect(cards.every((p) => p.icon === CARD_ICON)).toBe(true);
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

test("a details page: the days in the pair that trades most, in chaos and divines, and the two pairs' gap", () => {
  const h = (day: string, rate: number, volumePrimaryValue = 1) => ({ timestamp: `2026-11-${day}T00:00:00Z`, rate, volumePrimaryValue });
  const divine = divineDays({ pairs: [{ id: "chaos", rate: 150, history: [h("27", 150), h("26", 200)] }] });
  // As poe.ninja sends it, newest first: a card bought mostly in divines, a little in chaos.
  const trades = parseDetails(
    {
      pairs: [
        { id: "chaos", rate: 2800, history: [h("27", 2800, 28000), h("26", 3600, 0)] },
        { id: "divine", rate: 20, history: [h("27", 20, 300000), h("26", 19, 380000)] },
      ],
    },
    divine,
  )!;
  expect(trades.pair).toBe("divine");
  expect(trades.days.map((d) => d.day)).toEqual(["2026-11-26", "2026-11-27"]);
  expect(trades.days[1]).toEqual({ day: "2026-11-27", rate: 20, chaos: 3000, divines: 20, volume: (28000 + 300000) / 3000 });
  expect(trades.days[0].chaos).toBe(3800);
  // Only days both pairs traded: in divines, 20 × 150 = 3000 over 2800 in chaos.
  expect(trades.cross).toEqual([
    { day: "2026-11-27", ratio: 3000 / 2800, volume: 28000, chaos: 2800, divines: 20, divine: 150, chaosVolume: 28000, divineVolume: 300000 },
  ]);
});
