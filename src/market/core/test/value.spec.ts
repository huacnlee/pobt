import { describe, expect, test } from "bun:test";
import { DEFAULT_MODEL, liquidity, stackFor, worth } from "../value";
import { find } from "./fixture";

describe("liquidity", () => {
  test("currency that trades a lot on the exchange is close to 1", () => {
    expect(liquidity(find("Divine Orb"))).toBeGreaterThan(0.99);
  });
  test("an item nobody sells or trades has none", () => {
    expect(liquidity(find("Chaos Shard"))).toBe(0);
  });
  test("few sellers and a swinging price discount an item hard", () => {
    expect(liquidity(find("Rare Thing"))).toBeLessThan(0.1);
    expect(liquidity(find("Goldrim"))).toBeGreaterThan(0.75);
  });
});

describe("worth", () => {
  test("a cheap unique is worth less than nothing once it has to be sold", () => {
    expect(worth(find("Goldrim"))).toBeLessThan(0);
  });
  test("a stack is worth its count", () => {
    const alt = find("Orb of Alteration");
    expect(worth(alt, 50)).toBeCloseTo(50 * worth(alt, 1) + 49 * DEFAULT_MODEL.cost.exchange, 6);
  });
});

describe("stackFor", () => {
  test("the smallest stack that reaches the worth", () => {
    const alt = find("Orb of Alteration");
    const n = stackFor(alt, 5)!;
    expect(worth(alt, n)).toBeGreaterThanOrEqual(5);
    expect(worth(alt, n - 1)).toBeLessThan(5);
  });
  test("one when a single one is already worth it", () => {
    expect(stackFor(find("Divine Orb"), 20)).toBe(1);
  });
  test("none when it does not sell", () => {
    expect(stackFor(find("Chaos Shard"), 1)).toBeUndefined();
  });
});
