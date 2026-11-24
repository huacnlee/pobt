// Writes trs/zh-rCN/tencent/stats.csv: the mods of Path of Exile as Tencent's site words them now, with their English,
// which POBT reads to turn the Chinese items of Tencent's characters back into the English Path of Building reads.
// Tencent's trade site lists its mods with the ids of the official one's; Awakened PoE Trade's data gives the English
// for those ids (the official site's own list is behind a browser check); for Path of Exile 2, its trade2 list and
// Exiled Exchange 2's, to trs/zh-rCN/tencent-poe2/stats.csv. Run again when a league changes the mods:
//   node scripts/tencent-stats.mjs        # Path of Exile
//   node scripts/tencent-stats.mjs poe2   # Path of Exile 2
import { mkdirSync, writeFileSync } from "fs";

const POE2 = process.argv[2] === "poe2";
const TENCENT = `https://poe.game.qq.com/api/${POE2 ? "trade2" : "trade"}/data/stats`;
const ENGLISH = POE2
  ? "https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/master/renderer/public/data/en/stats.ndjson"
  : "https://raw.githubusercontent.com/SnosMe/awakened-poe-trade/master/renderer/public/data/en/stats.ndjson";
const OUT = new URL(`../trs/zh-rCN/${POE2 ? "tencent-poe2" : "tencent"}/stats.csv`, import.meta.url);

// A mod's text the other way ("increased" as "reduced"): Tencent lists only one way, the English both.
const OPPOSITE = [
  ["提高", "降低"],
  ["加快", "减慢"],
  ["延长", "缩短"],
  ["扩大", "缩小"],
  ["增加", "减少"],
];

async function get(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const tencent = JSON.parse(
  await get(TENCENT, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" } }),
);
// Chinese by trade id, without the "(区域)" of a mod local to its item (the English has none).
const zh = new Map();
for (const group of tencent.result) {
  for (const e of group.entries) {
    if (e.text.includes("\n")) continue;
    zh.set(e.id, e.text.replace(/\s*[(（]区域[)）]\s*$/, "").trim());
  }
}

// English by trade id: the text, and its other way when it has one.
const en = new Map();
for (const line of (await get(ENGLISH)).split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  for (const stat of row.stats ?? [row]) {
    const plain = stat.matchers.find((m) => !m.negate && m.value === undefined)?.string ?? stat.ref;
    const negated = stat.matchers.find((m) => m.negate && m.value === undefined)?.string;
    for (const ids of Object.values(stat.trade?.ids ?? {})) {
      for (const id of ids) if (!en.has(id)) en.set(id, { plain: plain.trim(), negated: negated?.trim() });
    }
  }
}

const rows = new Map();
const add = (english, chinese) => {
  if (!/[a-z]/i.test(english) || !/[⺀-鿿]/.test(chinese) || rows.has(chinese)) return;
  // A number the English has and the Chinese leaves out ("获得额外技能栏"): nothing to fill it with.
  if (english.includes("#") && !/#|d/.test(chinese)) return;
  rows.set(chinese, english);
};
for (const [id, chinese] of zh) {
  const e = en.get(id);
  if (!e) continue;
  add(e.plain, chinese);
  if (!e.negated) continue;
  const [from, to] = OPPOSITE.find(([a]) => chinese.includes(a)) ?? [];
  if (from) add(e.negated, chinese.replace(from, to));
}

const quote = (s) => `"${s.replaceAll('"', '""')}"`;
const csv = [...rows].map(([chinese, english]) => `${quote(english)},${quote(chinese)}`).sort().join("\n") + "\n";
mkdirSync(new URL(".", OUT), { recursive: true });
writeFileSync(OUT, csv);
console.log(`${rows.size} mods of ${zh.size} Tencent lists, ${en.size} English ids: ${OUT.pathname}`);

// Path of Exile 2: the English names of bases, uniques and gems by their art (their icon's path), which WeGame's
// characters have in their icons, to tencent-poe2/art/art.csv: Tencent's names have no list to join by id.
if (POE2) {
  const ITEMS = "https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/master/renderer/public/data/en/items.ndjson";
  const art = (icon) => {
    const part = icon?.match(/\/image\/([^/]+)\//)?.[1];
    if (!part) return null;
    try {
      const v = JSON.parse(Buffer.from(part.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString());
      return v[2]?.f ?? null;
    } catch {
      return null;
    }
  };
  const names = new Map();
  for (const line of (await get(ITEMS)).split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const a = art(row.icon);
    if (!a || !["ITEM", "UNIQUE", "GEM"].includes(row.namespace)) continue;
    const key = `${a}\t${row.namespace}\t${row.name}`;
    names.set(key, [a, row.namespace, row.name]);
  }
  const out = new URL("../trs/zh-rCN/tencent-poe2/art/art.csv", import.meta.url);
  mkdirSync(new URL(".", out), { recursive: true });
  writeFileSync(out, [...names.values()].map((r) => r.map(quote).join(",")).sort().join("\n") + "\n");
  console.log(`${names.size} names by art: ${out.pathname}`);
}
