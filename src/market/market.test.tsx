import { mkdir, readFile, rmdir, unlink, writeFile } from "fs/promises";
import { expect, open, type OpenOptions, type StubResponse, test } from "nsh/test";
import { join } from "path";
import { homedir } from "os";
import { ninja, OVERVIEWS, stubNinja } from "./testdata/ninja";

/**
 * The market on a desktop-sized window (market.fixture.tsx), reading the test's poe.ninja; `storage` as kept from an
 * earlier start. It shows `locale`'s language headless; on a real desktop (`--target`), the system's.
 */
function start(locale: string, options: Pick<OpenOptions, "storage" | "platform" | "modules" | "clock"> = {}) {
  const stub = stubNinja();
  const storage = { ...options.storage };
  const app = open("./market.fixture.tsx", { locale, width: 1200, height: 800, network: stub.network, ...options, storage });
  return app.then((a) => Object.assign(a, { asked: stub.asked }));
}

let headlessRun: Promise<boolean> | undefined;
/**
 * Whether the tests run headless (`nsh test`), not on a real platform (`nsh test --target`). Some need it: stand-ins
 * for native modules (`modules`) and `setLifecycle` are headless only, and a second start carries the first's files
 * over in Storage only headless, where the app has no data folder (on a platform each start has a folder of its own).
 * Those tests say so and end at once on a platform.
 */
async function needsHeadless(why: string): Promise<boolean> {
  // `modules` opens headless and is refused on a platform.
  headlessRun ??= open("./market.fixture.tsx", { modules: { nsh: { "Notifications.permission": () => "default" } }, network: {} }).then(
    () => true,
    () => false,
  );
  if (await headlessRun) return false;
  console.log(`skipped on --target: ${why}`);
  return true;
}

/** The requests the app made to poe.ninja. */
const ninjaRequests = (app: { requests(): { url: string }[] }) => app.requests().filter((r) => r.url.startsWith("https://poe.ninja/"));

const DOCTOR = "dip:DivinationCard:the-doctor";
const overviews = (asked: { url: string }[]) => asked.filter((r) => !r.url.includes("/details?")).length;

test("it opens straight into the opportunities, with no sign-in, and makes them from poe.ninja", async () => {
  const app = await start("zh-CN");
  await app.waitFor("低吸 疯医", { timeout: 10000 });
  const reasons = app.texts().find((s) => s.startsWith("前 7 天稳定成交在 27 div 左右，最近两天跌了 19%"));
  expect(reasons).toBeDefined();
  expect(reasons).toContain("下跌时的成交量是平时的 1.8 倍：低价确实有人在买");
  expect(reasons).toContain("风险中");
  // POBT says who it is, and asks for each page once: the league, the 20 overviews, the details of the candidates.
  expect(app.asked.every((r) => r.headers["user-agent"]?.startsWith("POBT/"))).toBe(true);
  expect(overviews(app.asked)).toBe(OVERVIEWS);
  expect(app.texts()).not.toContain("会员");
});

test("in English, the same opportunity in English", async () => {
  const app = await start("en-US");
  await app.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  await app.press("opportunity-0");
  await app.waitFor("Buy 1 × The Doctor on the Currency Exchange (Faustus) at 22 div each or less");
  await app.waitFor("List it at 24.8 div: it traded at 27 div before the drop, less about 8.0% for the spread");
});

test("while it updates, the title bar says how far it is", async () => {
  // Every page takes a moment, as poe.ninja's do.
  const app = await open("./market.fixture.tsx", {
    locale: "zh-CN",
    width: 1200,
    height: 800,
    network: { "https://poe.ninja/*": (request) => ({ ...ninja(request), delay: 150 }) },
  });
  await app.waitUntil(() => app.texts().some((s) => /^更新行情中… \d+\/\d+$/.test(s)), { timeout: 10000 });
  await app.waitUntil(() => app.texts().some((s) => s.startsWith("Covens · ") && s.endsWith("更新")), { timeout: 20000 });
});

test("poe.ninja asking to slow down is waited out, then asked again", async () => {
  let refused = 0;
  const stub = stubNinja((request) => {
    if (request.url.includes("type=Fragment") && refused++ === 0) return { status: 429, headers: { "retry-after": "1" }, body: "" };
    return undefined;
  });
  const app = await open("./market.fixture.tsx", { locale: "en-US", width: 1200, height: 800, network: stub.network });
  await app.waitFor("Buy the dip: The Doctor", { timeout: 15000 });
  expect(stub.asked.filter((r) => r.url.includes("type=Fragment")).length).toBe(2);
});

test("what it computed is kept: the next start shows it at once and asks poe.ninja nothing within the hour", async () => {
  if (await needsHeadless("a second start reads the first's files from Storage")) return;
  const first = await start("en-US");
  await first.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  await first.waitUntil(() => Object.keys(first.storage()).some((k) => k.startsWith("market.file:history/")));

  const again = await start("en-US", { storage: first.storage() });
  await again.waitFor("Buy the dip: The Doctor");
  await again.press("nav-market");
  await again.waitFor("page-market");
  await again.press("nav-search");
  await again.waitFor("Divine Orb");
  expect(again.asked.length).toBe(0);
  expect(ninjaRequests(again)).toEqual([]);
});

test("poe.ninja is asked again only once the hour has passed, when the app is in use", async () => {
  if (await needsHeadless("setLifecycle is headless only")) return;
  const stub = stubNinja();
  const now = Date.parse("2026-11-27T08:00:00Z");
  const app = await open("./market.fixture.tsx", { locale: "en-US", width: 1200, height: 800, network: stub.network, clock: { time: now } });
  await app.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  const once = stub.asked.length;
  expect(overviews(stub.asked)).toBe(OVERVIEWS);

  // Back to the front after half an hour, and the Refresh button: nothing asked.
  app.clock!.setSystemTime(now + 30 * 60_000);
  await app.setLifecycle("background");
  await app.setLifecycle("active");
  await app.press("update-refresh");
  await app.waitFor("Already up to date; poe.ninja is asked at most once an hour");
  expect(stub.asked.length).toBe(once);

  // After the hour, coming back to the front updates.
  app.clock!.setSystemTime(now + 61 * 60_000);
  await app.setLifecycle("background");
  await app.setLifecycle("active");
  await app.waitUntil(() => overviews(stub.asked) === 2 * OVERVIEWS, { timeout: 10000 });
});

test("the loot filter goes by the game's stage, made from the market's prices", async () => {
  const app = await start("zh-CN");
  await app.press("nav-filter");
  await app.waitFor("异界");
  await app.waitFor("POBT-maps.filter");
  await app.press("终局");
  await app.waitFor("POBT-endgame.filter");
  await app.waitUntil(() => app.texts().some((s) => s.includes("90 级以后") && /\d+ 条规则/.test(s)), { timeout: 10000 });
});

test("on the desktop, one press writes the filter into the game's folder, with the player's own sounds", async () => {
  // A filter folder of the test's own, holding a sound from a pack the player already has. Under the home folder,
  // where the app may write (nsh.json `capabilities.fs`), as the game's folder is; never the game's own folder.
  const folder = join(homedir(), `.pobt-market-test-${Date.now()}`);
  const sound = join(folder, "音效", "神圣石.mp3");
  await mkdir(join(folder, "音效"), { recursive: true });
  await writeFile(sound, "ID3");
  const app = await start("zh-CN", {
    platform: "macos",
    storage: {
      "market.settings": JSON.stringify({ filterFolder: folder, refreshMinutes: 10, filterSound: "custom", filterSounds: ["音效/神圣石.mp3", "", ""] }),
    },
  });
  try {
    await app.press("nav-filter");
    await app.waitFor("过滤器文件夹里有 1 个音效文件");
    await app.press("终局");
    await app.press("install");
    await app.waitUntil(() => app.texts().some((s) => s.startsWith("已安装 POBT-endgame")), { timeout: 10000 });
    const text = await readFile(join(folder, "POBT-endgame.filter"), "utf8");
    expect(text.startsWith("# POBT smart loot filter for Path of Exile — Covens")).toBe(true);
    expect(text).toContain('CustomAlertSound "音效/神圣石.mp3"');
    expect(text).toContain('"The Doctor"');
    expect(JSON.parse(app.storage()["market.filter"]).choice).toEqual({ stage: "endgame" });
  } finally {
    await unlink(join(folder, "POBT-endgame.filter")).catch(() => {});
    await unlink(sound).catch(() => {});
    await rmdir(join(folder, "音效")).catch(() => {});
    await rmdir(folder).catch(() => {});
  }
});

test("on the desktop, an installed filter is written again when an update brings new prices", async () => {
  const folder = join(homedir(), `.pobt-market-test-${Date.now()}`);
  const file = join(folder, "POBT-maps.filter");
  await mkdir(folder, { recursive: true });
  await writeFile(file, "# yesterday\n");
  const app = await start("en-US", {
    platform: "windows",
    storage: {
      "market.settings": JSON.stringify({ filterFolder: folder, refreshMinutes: 10 }),
      "market.filter": JSON.stringify({ choice: { stage: "maps" }, path: file, at: "2026-01-01T00:00:00.000Z" }),
    },
  });
  try {
    let text = "";
    await app.waitUntil(() => text.startsWith("# POBT smart loot filter") || (void readFile(file, "utf8").then((t) => (text = t)), false), { timeout: 10000 });
    await app.waitFor("The loot filter was updated to the new prices");
    expect(JSON.parse(app.storage()["market.filter"]).at).not.toBe("2026-01-01T00:00:00.000Z");
  } finally {
    await unlink(file).catch(() => {});
    await rmdir(folder).catch(() => {});
  }
});

test("a setting chosen on the settings page is kept: after moving away and back, and on the next start", async () => {
  const app = await start("en-US");
  await app.press("nav-settings");
  await app.waitFor("How often alerts are checked");
  await app.press("How often alerts are checked");
  await app.press("30 minutes");
  await app.waitUntil(() => JSON.parse(app.storage()["market.settings"] ?? "{}").refreshMinutes === 30);
  await app.press("nav-watchlist");
  await app.waitFor("page-watchlist");
  await app.press("nav-settings");
  await app.waitFor("30 minutes");
  expect(app.texts()).not.toContain("10 minutes");

  const again = await start("en-US", { storage: app.storage() });
  await again.press("nav-settings");
  await again.waitFor("30 minutes");
  expect(again.texts()).not.toContain("10 minutes");
});

test("the settings page says how old the market is and where it is kept, and clears it", async () => {
  const app = await start("en-US");
  await app.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  await app.press("nav-settings");
  await app.waitUntil(() => app.texts().some((s) => s.startsWith("Covens · updated")));
  // Headless, the host has no data folder: the files are in the app's storage; on a desktop, its data folder.
  await app.waitUntil(() => app.texts().some((s) => s === "In the app's own storage" || s.startsWith("/")));
  await app.waitUntil(() => app.texts().some((s) => s.startsWith("Covens: ")));
  app.onDialog(() => "Clear");
  await app.press("clear-data");
  await app.waitFor("The market data was cleared");
  await app.waitFor("No market yet");
  // poe.ninja's pages stay in the cache: only the market made from them went.
  const files = Object.keys(app.storage()).filter((k) => k.startsWith("market.file:"));
  expect(files.every((k) => k.startsWith("market.file:cache/"))).toBe(true);
});

test("the settings page says how much the cache keeps and where, and clears it apart from the market", async () => {
  const app = await start("zh-CN");
  await app.waitFor("低吸 疯医", { timeout: 10000 });
  await app.press("nav-settings");
  await app.waitUntil(() => app.texts().some((s) => /^已缓存 \d+(\.\d)? (KB|MB)$/.test(s)));
  // Headless, in the app's storage (shown for the data and for the cache); on a desktop, a folder named cache.
  await app.waitUntil(() => app.texts().filter((s) => s === "应用自己的存储里").length === 2 || app.texts().some((s) => s.endsWith("/cache")));
  app.onDialog(() => "清除缓存");
  await app.press("clear-cache");
  await app.waitFor("缓存已清除");
  await app.waitFor("已缓存 0 B");
  const files = Object.keys(app.storage()).filter((k) => k.startsWith("market.file:"));
  expect(files.some((k) => k.startsWith("market.file:cache/"))).toBe(false);
  // The market stays, on the settings page and on its own.
  expect(app.texts().some((s) => s.startsWith("Covens · ") && s.endsWith("更新"))).toBe(true);
  await app.press("nav-opportunities");
  await app.waitFor("低吸 疯医");
});

/** poe.ninja as it answers again after the hour: a version tag on each page, and "not modified" when it is sent back. */
function withVersions() {
  return stubNinja((request): StubResponse => {
    if (request.headers["if-none-match"] === '"v1"') return { status: 304, headers: { etag: '"v1"' } };
    return { ...ninja(request), headers: { etag: '"v1"', "last-modified": "Fri, 27 Nov 2026 07:00:00 GMT" } };
  });
}

test("after the hour, poe.ninja is asked conditionally, and when nothing changed nothing is computed again", async () => {
  if (await needsHeadless("setLifecycle is headless only")) return;
  const stub = withVersions();
  const now = Date.parse("2026-11-27T08:00:00Z");
  const app = await open("./market.fixture.tsx", { locale: "en-US", width: 1200, height: 800, network: stub.network, clock: { time: now } });
  await app.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  const first = stub.asked.length;
  expect(stub.asked.some((r) => r.headers["if-none-match"])).toBe(false);
  const made = JSON.parse(app.storage()["market.file:market/meta.json"]);
  const page = JSON.parse(app.storage()["market.file:cache/ninja/Covens/exchange-DivinationCard.head.json"]);
  expect(page.etag).toBe('"v1"');
  expect(page.lastModified).toBe("Fri, 27 Nov 2026 07:00:00 GMT");

  app.clock!.setSystemTime(now + 61 * 60_000);
  await app.setLifecycle("background");
  await app.setLifecycle("active");
  await app.waitUntil(() => stub.asked.length === 2 * first, { timeout: 10000 });
  const again = stub.asked.slice(first);
  expect(again.every((r) => r.headers["if-none-match"] === '"v1"' && r.headers["if-modified-since"] === "Fri, 27 Nov 2026 07:00:00 GMT")).toBe(true);
  // Every page "not modified": the market is the one made before, checked just now.
  await app.waitUntil(() => JSON.parse(app.storage()["market.file:market/meta.json"]).checkedAt !== made.checkedAt);
  const checked = JSON.parse(app.storage()["market.file:market/meta.json"]);
  expect(checked.at).toBe(made.at);
  expect(Date.parse(checked.checkedAt)).toBe(now + 61 * 60_000);
  await app.waitUntil(() => app.texts().includes("Covens · updated just now"));
});

/** A first start that kept the market, then a start `hours` later with no network. */
async function offlineLater(hours: number, keep: (key: string) => boolean = () => true) {
  const now = Date.parse("2026-11-27T08:00:00Z");
  const first = await start("zh-CN", { clock: { time: now } });
  await first.waitFor("低吸 疯医", { timeout: 10000 });
  await first.waitUntil(() => Object.keys(first.storage()).some((k) => k.startsWith("market.file:history/")));
  const storage = Object.fromEntries(Object.entries(first.storage()).filter(([k]) => keep(k)));
  return open("./market.fixture.tsx", {
    locale: "zh-CN",
    width: 1200,
    height: 800,
    storage,
    clock: { time: now + hours * 3_600_000 },
    network: { "https://poe.ninja/*": () => ({ error: "The Internet connection appears to be offline." }) },
  });
}

test("offline, the market kept stays on screen with its age, not an error", async () => {
  if (await needsHeadless("a second start reads the first's files from Storage")) return;
  const app = await offlineLater(3);
  await app.waitFor("低吸 疯医");
  await app.waitFor("离线 · 数据更新于 3 小时前", { timeout: 10000 });
  expect(app.texts()).not.toContain("无法加载");
  // Refresh says it is offline and keeps the market.
  await app.press("update-refresh");
  await app.waitFor("离线，显示的是本机保存的行情", { timeout: 10000 });
  await app.waitFor("低吸 疯医");
});

test("offline with the market cleared, it is made again from poe.ninja's pages kept", async () => {
  if (await needsHeadless("a second start reads the first's files from Storage")) return;
  const app = await offlineLater(2, (k) => !k.startsWith("market.file:market/") && !k.startsWith("market.file:history/"));
  await app.waitFor("低吸 疯医", { timeout: 15000 });
  await app.waitFor("离线 · 数据更新于 2 小时前");
});

test("a first start with no network and nothing kept says so, and Retry asks again", async () => {
  let online = false;
  const stub = stubNinja(() => (online ? undefined : { error: "offline" }));
  const app = await open("./market.fixture.tsx", { locale: "en-US", width: 1200, height: 800, network: stub.network });
  await app.waitFor("Could not reach poe.ninja; check your connection.", { timeout: 15000 });
  await app.waitFor("Offline: poe.ninja can't be reached");
  online = true;
  await app.press("Retry");
  await app.waitFor("Buy the dip: The Doctor", { timeout: 15000 });
});

/** The app with its notifications allowed and each one shown kept in `shown`. */
function withNotifications(storage: Record<string, string>, shown: { id: string; title: string }[]) {
  return start("en-US", {
    storage,
    modules: {
      nsh: {
        "Notifications.permission": () => "granted",
        "Notifications.show": (n: { id: string; title: string }) => {
          shown.push(n);
          return true;
        },
      },
    },
  });
}

const seen = (app: { storage(): Record<string, string> }) => JSON.parse(app.storage()["market.seenOpportunities"] ?? '{"primed":[],"ids":[]}');

test("a new opportunity of a kind followed notifies once, after the update that found it", async () => {
  if (await needsHeadless("notifications are stood in for with `modules`, headless only")) return;
  const shown: { id: string; title: string }[] = [];
  const app = await withNotifications(
    {
      "market.settings": JSON.stringify({ filterFolder: "", refreshMinutes: 10, oppAlerts: { dip: true, cycle: false } }),
      "market.seenOpportunities": JSON.stringify({ primed: ["dip"], ids: [] }),
    },
    shown,
  );
  await app.waitUntil(() => shown.length === 1, { timeout: 10000 });
  expect(shown[0].id).toBe(`opp:${DOCTOR}`);
  expect(shown[0].title).toBe("New: Buy the dip: The Doctor");
  expect(seen(app).ids).toContain(DOCTOR);
  // Checking again finds nothing new.
  await app.press("nav-watchlist");
  await app.press("Check alerts");
  await app.wait(1000);
  expect(shown.length).toBe(1);
});

test("turning on a kind takes in what is listed without notifying; a threshold holds back what is below it", async () => {
  if (await needsHeadless("notifications are stood in for with `modules`, headless only")) return;
  const shown: { id: string; title: string }[] = [];
  const app = await withNotifications({}, shown);
  await app.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  await app.press("nav-watchlist");
  await app.waitFor("Opportunity alerts");
  await app.press("Alerts for new Dips");
  await app.waitUntil(() => seen(app).primed.includes("dip"));
  expect(seen(app).ids).toContain(DOCTOR);
  expect(JSON.parse(app.storage()["market.settings"]).oppAlerts).toEqual({ dip: true, cycle: false });
  expect(shown.length).toBe(0);

  // Primed, but it makes about 200 c and the alert asks for 500.
  const again = await withNotifications(
    {
      "market.settings": JSON.stringify({ filterFolder: "", refreshMinutes: 10, oppAlerts: { dip: true, cycle: false, minProfit: 500 } }),
      "market.seenOpportunities": JSON.stringify({ primed: ["dip"], ids: [] }),
    },
    shown,
  );
  await again.waitUntil(() => seen(again).ids.length === 1, { timeout: 10000 });
  expect(shown.length).toBe(0);
});

test("a trade keeps its item's picture: from an opportunity, and added by hand under a name the market knows", async () => {
  const app = await start("en-US");
  const trades = () => JSON.parse(app.storage()["market.ledger"] ?? "[]");
  await app.waitFor("opportunity-0", { timeout: 10000 });
  await app.press("opportunity-0");
  await app.press("Buy 1 × The Doctor on the Currency Exchange (Faustus) at 22 div each or less");
  await app.press("record");
  await app.waitUntil(() => trades().length === 1);
  expect(trades()[0].icon).toBe("gen/image/the-doctor.png");

  await app.press("nav-ledger");
  await app.press("Add a trade");
  await app.type("e.g. Divine Orb", "the doctor");
  await app.type("Price paid each", "3000");
  await app.press("Save");
  await app.waitUntil(() => trades().length === 2 && trades()[0].icon === "gen/image/the-doctor.png");
  expect(trades()[0].itemId).toBe("DivinationCard:the-doctor");
});

// A cycle as the engine computes one: chaos → Exalted Orb → divine → chaos, each trade with its rate, its pair's day
// and what one chaos is worth after it.
const CYCLE = {
  id: "cycle:Currency:chaos>Currency:exalted-orb>Currency:divine>Currency:chaos",
  path: ["Chaos Orb", "Exalted Orb", "Divine Orb", "Chaos Orb"],
  ids: ["Currency:chaos", "Currency:exalted-orb", "Currency:divine", "Currency:chaos"],
  ratio: 1.06667,
  edge: 5.17,
  volume: 100000,
  usual: 1.05,
  legs: [
    { from: "Chaos Orb", to: "Exalted Orb", fromId: "Currency:chaos", toId: "Currency:exalted-orb", rate: 0.1, volume: 100000, unit: "Exalted Orb", volumeChaos: 1000000, value: 0.995 },
    { from: "Exalted Orb", to: "Divine Orb", fromId: "Currency:exalted-orb", toId: "Currency:divine", rate: 0.0711, quoted: 0.0747, volume: 178571, unit: "Exalted Orb", volumeChaos: 2000000, value: 1.0567 },
    { from: "Divine Orb", to: "Chaos Orb", fromId: "Currency:divine", toId: "Currency:chaos", rate: 150, volume: 5000, unit: "Divine Orb", volumeChaos: 750000, value: 1.0517 },
  ],
};

/** The market computed once, then kept with a cycle in it: the next start reads it, as after a restart. */
async function withCycle(locale: string) {
  const first = await start("en-US");
  await first.waitFor("Buy the dip: The Doctor", { timeout: 10000 });
  const storage = first.storage();
  const file = JSON.parse(storage["market.file:market/opportunities.json"]);
  const opportunity = {
    id: CYCLE.id,
    type: "cycle",
    title: `Cycle: ${CYCLE.path.join(" → ")}`,
    itemId: "Currency:exalted-orb",
    itemName: "Exalted Orb",
    buy: { price: 10, where: "exchange", qty: 1, cost: 300, currency: "Exalted Orb" },
    sell: { price: 1, where: "exchange", currency: "Chaos Orb" },
    profit: 15.5,
    roi: 0.0517,
    sellHours: 0.5,
    risk: "medium",
    reasons: [{ key: "cycleEdge", percent: "5.2" }],
    steps: [{ key: "cycleStart", price: "300", item: "Exalted Orb" }, { key: "record" }],
    cycle: CYCLE,
  };
  storage["market.file:market/opportunities.json"] = JSON.stringify({ ...file, cycles: [CYCLE], opportunities: [opportunity] });
  return start(locale, { storage });
}

test("a cycle's ring: each trade's rate, its pair's day and the value after it, the net on the closing arrow", async () => {
  if (await needsHeadless("the cycle is put into the first start's files, carried over in Storage")) return;
  const app = await withCycle("en-US");
  // The first cycle opens with its ring drawn.
  await app.waitFor("cycle-ring");
  for (const line of [
    "1 c → 0.1 Exalted Orb",
    "100k traded today · 6667 div",
    "1 c is now 0.995 c",
    "1 Exalted Orb → 0.071 div",
    "179k traded today · 13.3k div",
    "1 c is now 1.057 c",
    "1 div → 150 c",
    "5000 traded today · 5000 div",
    "Back at 1.052 c · net +5.2%",
  ]) {
    expect(app.texts()).toContain(line);
  }
  expect(app.accessibility("cycle-ring")?.label).toContain("Arbitrage loop: Chaos Orb to Exalted Orb at 1 to 0.1");
  // Closed and opened again from its header.
  await app.press("cycle-0");
  await app.waitUntil(() => !app.shows("cycle-ring"));
  await app.press("cycle-0");
  await app.waitFor("cycle-ring");

  // The cycle's opportunity draws the same ring.
  await app.press("opportunity-0");
  await app.waitFor("The loop");
  await app.waitFor("Back at 1.052 c · net +5.2%");
  expect(app.asked.length).toBe(0);
});

test("in Chinese, the ring names the items as Tencent does", async () => {
  if (await needsHeadless("the cycle is put into the first start's files, carried over in Storage")) return;
  const app = await withCycle("zh-CN");
  await app.waitFor("1 c → 0.1 崇高石");
  expect(app.texts()).toContain("回到 1.052 c · 净赚 +5.2%");
});

test("a toast shows whole, inside the window's bottom right corner", async () => {
  const app = await start("en-US");
  await app.press("nav-watchlist");
  await app.press("Check alerts");
  await app.waitFor("Refreshed; no new alert", { timeout: 10000 });
  const box = app.layout("Refreshed; no new alert");
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1200);
  expect(box!.y).toBeGreaterThan(400);
});
