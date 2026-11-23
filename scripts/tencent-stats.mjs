// Writes trs/zh-rCN/tencent/stats.csv: the mods of Path of Exile as Tencent's site words them now, with their English,
// which POBT reads to turn the Chinese items of Tencent's characters back into the English Path of Building reads.
// Tencent's trade site lists its mods with the ids of the official one's; Awakened PoE Trade's data gives the English
// for those ids (the official site's own list is behind a browser check). Run again when a league changes the mods:
//   node scripts/tencent-stats.mjs
import { mkdirSync, writeFileSync } from "fs";

const TENCENT = "https://poe.game.qq.com/api/trade/data/stats";
const ENGLISH = "https://raw.githubusercontent.com/SnosMe/awakened-poe-trade/master/renderer/public/data/en/stats.ndjson";
const OUT = new URL("../trs/zh-rCN/tencent/stats.csv", import.meta.url);

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
