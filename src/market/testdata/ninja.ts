// A small poe.ninja for the tests: the league, the 20 overview pages (most of them empty) and the details pages the
// app asks for, shaped as poe.ninja sends them (core/ninja.ts reads them). The Doctor traded steadily at about
// 27 div for a week, then fell 19% in two days on 1.8 times its usual volume: a dip, as core/market.ts sees one.
import type { StubRequest, StubResponse } from "nsh/test";

export const API = "https://poe.ninja/poe1/api";
export const LEAGUE = "Covens";
export const DIVINE = 150;

/** Nine days of trades before today, oldest first. */
const DAYS = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];
/** The Doctor's rate in divines each day, and how many traded. */
const DOCTOR_RATES = [27, 27.2, 26.9, 27.1, 27, 26.8, 27, 25, 22];
const DOCTOR_VOLUMES = [10, 10, 10, 10, 10, 10, 10, 12, 18];

type Line = { id: string; name: string; chaos: number; volume: number; image?: string; details?: string };

const exchange = (lines: Line[]) => ({
  core: { rates: { divine: 1 / DIVINE } },
  lines: lines.map((l) => ({ id: l.id, primaryValue: l.chaos, volumePrimaryValue: l.chaos * l.volume })),
  items: lines.map((l) => ({ id: l.id, name: l.name, image: l.image, detailsId: l.details })),
});

const PAGES: Record<string, unknown> = {
  Currency: exchange([
    { id: "divine", name: "Divine Orb", chaos: DIVINE, volume: 5000, image: "/gen/image/divine.png", details: "divine-orb" },
    { id: "exalted-orb", name: "Exalted Orb", chaos: 10, volume: 20000, image: "/gen/image/exalted.png", details: "exalted-orb" },
    { id: "orb-of-fusing", name: "Orb of Fusing", chaos: 0.5, volume: 50000, details: "orb-of-fusing" },
  ]),
  DivinationCard: exchange([
    { id: "the-doctor", name: "The Doctor", chaos: 22 * DIVINE, volume: 18, image: "/gen/image/the-doctor.png", details: "the-doctor" },
    { id: "rain-of-chaos", name: "Rain of Chaos", chaos: 0.3, volume: 3000, details: "rain-of-chaos" },
  ]),
  UniqueAccessory: {
    lines: [{ id: 1, name: "Headhunter", baseType: "Leather Belt", itemType: "Belt", chaosValue: 30 * DIVINE, listingCount: 40 }],
  },
  BaseType: {
    lines: [
      { id: 10, name: "Opal Ring", itemType: "Ring", levelRequired: 86, chaosValue: 40, listingCount: 300 },
      { id: 11, name: "Stygian Vise", itemType: "Belt", levelRequired: 86, chaosValue: 8, listingCount: 200 },
    ],
  },
};

const history = (rates: number[], volumes: (rate: number, i: number) => number) =>
  rates.map((rate, i) => ({ timestamp: `${DAYS[i]}T00:00:00Z`, rate, volumePrimaryValue: volumes(rate, i) }));

const DETAILS: Record<string, unknown> = {
  "divine-orb": { pairs: [{ id: "chaos", rate: DIVINE, history: history(DAYS.map(() => DIVINE), () => DIVINE * 5000) }] },
  // In divines: the volume's value is in chaos (the rate in chaos times how many traded).
  "the-doctor": {
    pairs: [{ id: "divine", rate: 22, volumePrimaryValue: 22 * DIVINE * 18, history: history(DOCTOR_RATES, (rate, i) => rate * DIVINE * DOCTOR_VOLUMES[i]) }],
  },
};

/** Every page's URL, and how many there are: the league, 20 overviews. */
export const OVERVIEWS = 21;

/** What poe.ninja answers a request: a page above, an empty one for the rest. */
export function ninja(request: StubRequest): StubResponse {
  const url = request.url;
  const param = (name: string) => decodeURIComponent(url.match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "");
  if (url.includes("/data/index-state")) return { body: { economyLeagues: [{ name: LEAGUE }, { name: `Hardcore ${LEAGUE}` }, { name: "Standard" }] } };
  const type = param("type");
  if (url.includes("/details?")) {
    const page = DETAILS[param("id")];
    // The rest have no days of trades to show.
    return { body: page ?? { pairs: [] } };
  }
  if (url.includes("/exchange/")) return { body: PAGES[type] ?? { lines: [], items: [] } };
  return { body: PAGES[type] ?? { lines: [] } };
}

/** The network of an app that reads poe.ninja, and every request it made there. */
export function stubNinja(over: (request: StubRequest) => StubResponse | undefined = () => undefined) {
  const asked: StubRequest[] = [];
  return {
    asked,
    network: {
      "https://poe.ninja/*": (request: StubRequest) => {
        asked.push(request);
        return over(request) ?? ninja(request);
      },
    },
  };
}
