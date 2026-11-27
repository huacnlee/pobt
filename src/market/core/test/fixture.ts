import type { Price, Snapshot } from "../types";

const p = (price: Partial<Price> & Pick<Price, "name" | "kind" | "chaos">): Price => ({
  baseType: price.name,
  listings: 100,
  ...price,
});

/** A small league: what the tests reason about, with round prices. */
export const SNAPSHOT: Snapshot = {
  league: "Test",
  at: "2026-11-27T00:00:00Z",
  divine: 150,
  prices: [
    p({ name: "Divine Orb", kind: "currency", chaos: 150, volume: 5000 }),
    p({ name: "Chaos Orb", kind: "currency", chaos: 1, volume: 900000 }),
    p({ name: "Orb of Alteration", kind: "currency", chaos: 0.1, volume: 20000 }),
    p({ name: "Vivid Crystallised Lifeforce", kind: "currency", chaos: 0.02, volume: 100000 }),
    p({ name: "Chaos Shard", kind: "currency", chaos: 0.05, volume: 0, listings: 0 }),
    p({ name: "The Doctor", kind: "card", chaos: 900, volume: 50 }),
    p({ name: "Rain of Chaos", kind: "card", chaos: 0.3, volume: 3000 }),
    // Headhunter's base: one prize, the rest junk.
    p({ name: "Headhunter", baseType: "Leather Belt", kind: "unique", chaos: 6000, listings: 40 }),
    p({ name: "Wurm's Molt", baseType: "Leather Belt", kind: "unique", chaos: 1, listings: 300 }),
    p({ name: "Bated Breath", baseType: "Leather Belt", kind: "unique", chaos: 1, listings: 200 }),
    // Plenty of sellers, no buyers worth the trip.
    p({ name: "Goldrim", baseType: "Leather Cap", kind: "unique", chaos: 2, listings: 500 }),
    // Dear but nobody sells: few listings, swinging price.
    p({ name: "Rare Thing", baseType: "Gold Ring", kind: "unique", chaos: 40, listings: 2, change7d: 150 }),
    p({ name: "Mageblood", baseType: "Heavy Belt", kind: "unique", chaos: 30000, listings: 30 }),
    p({ name: "Hubris Circlet", kind: "base", chaos: 60, listings: 80, itemLevel: 86, influence: "Shaper" }),
    p({ name: "Hubris Circlet", kind: "base", chaos: 2, listings: 80, itemLevel: 84 }),
  ],
};

export const find = (name: string) => SNAPSHOT.prices.find((p) => p.name === name)!;
