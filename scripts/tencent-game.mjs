// Writes trs/zh-rCN/tencent/game.csv: Path of Exile's mods, bases, uniques, gems and passives in Chinese and English,
// made from the game's own files, which POBT reads first to turn the Chinese items of Tencent's characters back into
// the English Path of Building reads. Unlike the trade site's list (`scripts/tencent-stats.mjs`), the game's files
// have every mod, and each of its ways ("increased" and "reduced").
// Two sources, the first one's row winning for a Chinese both have:
// - cn-poe-utils (https://github.com/cn-poe-community/cn-poe-utils, MIT): Tencent's client, so Tencent's words; it
//   stopped being updated in 2026-07.
// - go-pob-data (https://github.com/Vilsol/go-pob-data): the official client's Simplified Chinese, which Tencent's
//   rewords here and there, of every league as it comes out.
// A row whose Chinese has a name in it ("所有 {1} 宝石等级 +{0}") has a third column: the holes that hold a name, a
// gem's or a passive's, not a number. Run again when a league comes out:
//   node scripts/tencent-game.mjs
import { mkdirSync, writeFileSync } from "fs";
import { brotliDecompressSync } from "zlib";

const CN_POE_UTILS = "https://raw.githubusercontent.com/cn-poe-community/cn-poe-utils/b184052a9edcbe779b49bb0b8a70a1bbd968495c/data/db";
// Its bundles are in Git LFS: served from media.githubusercontent.com, its JSON from raw.githubusercontent.com.
const GO_POB = "https://raw.githubusercontent.com/Vilsol/go-pob-data/main/data";
const GO_POB_LFS = "https://media.githubusercontent.com/media/Vilsol/go-pob-data/main/data";
const OUT = new URL("../trs/zh-rCN/tencent/game.csv", import.meta.url);

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
const text = async (url) => (await get(url)).text();
const json = async (url) => JSON.parse(await text(url));
const ndjson = async (url) =>
  (await text(url))
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const rows = [];
const seen = new Set();
const add = (en, zh, names = []) => {
  // "[DNT]": the game's own placeholders ("do not translate"), on no item.
  if (!en || !zh || en === zh || seen.has(zh) || en.startsWith("[DNT]")) return;
  seen.add(zh);
  rows.push([en, zh, names.join(" ")]);
};

// cn-poe-utils. Names first: a mod's name holes are looked up among them.
const ITEMS = [
  "amulets", "belts", "body_armours", "boots", "flasks", "gloves", "helmets", "jewels", "quivers", "rings", "shields", "tattoos",
  "tinctures", "weapons",
];
for (const name of ITEMS) for (const i of await json(`${CN_POE_UTILS}/items/${name}.json`)) add(i.en, i.zh);
for (const u of await ndjson(`${CN_POE_UTILS}/uniques.ndjson`)) add(u.en, u.zh);
for (const name of ["gem_skills", "transfigured_skills", "hybrid_skills", "indexable_supports"]) {
  for (const s of await ndjson(`${CN_POE_UTILS}/skills/${name}.ndjson`)) add(s.en, s.zh);
}
for (const name of ["keystones", "ascendant", "anointed"]) {
  for (const p of await ndjson(`${CN_POE_UTILS}/passive_skills/${name}.ndjson`)) add(p.en, p.zh);
}
// The mods, in the order of the game's files: of two with the same Chinese, the first (the game's own) wins.
for (const s of [...(await json(`${CN_POE_UTILS}/stats/desc.json`)), ...(await json(`${CN_POE_UTILS}/stats/trade.json`))]) {
  add(s.en, s.zh, Object.keys(s.refs ?? {}));
}
const fromCnPoeUtils = rows.length;

// go-pob-data: its newest version of Path of Exile (not 2's "0.x").
const { versions } = await json(`${GO_POB}/meta.json`);
const version = versions.filter((v) => !v.startsWith("0.")).at(-1);
const manifest = await json(`${GO_POB}/${version}/manifest.json`);
const [bundle] = Object.values(manifest.translationBundles);
const descriptions = async (lang) => {
  const files = decode(brotliDecompressSync(Buffer.from(await (await get(`${GO_POB_LFS}/${version}/${bundle[lang]}`)).arrayBuffer())));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, decode(data)[0]]));
};
const [zhFiles, enFiles] = [await descriptions("cn"), await descriptions("en")];

// The files of items' and passives' mods; not skills', maps' or monsters'.
const FILES = [
  "stat_descriptions", "advanced_mod_stat_descriptions", "tincture_stat_descriptions", "graft_stat_descriptions",
  "passive_skill_stat_descriptions", "passive_skill_aura_stat_descriptions", "deepwater_explicit_stat_descriptions",
  "deepwater_implicit_stat_descriptions", "deepwater_applied_adjacent_stat_descriptions",
];
// What a hole's handler makes of its number: the same number both ways (as the game shows it, which is what is
// copied), a name, or something else (an item class, a timeless jewel's version), which the row is left without.
const NAMES = new Set(["passive_hash", "display_indexable_support", "display_indexable_skill", "display_indexable_non_active_support"]);
const OTHER = new Set([
  "alternate_tree_version_name", "alternate_tree_version_keystone", "affliction_reward_type", "weapon_tree_unique_base_type_name",
  "tree_expansion_jewel_passive", "mod_value_to_item_class", "pelagic_pearl_slot", "tempest_mod_text", "minion_doubling_type",
  "shaper_apparition_ability", "fishing_lure_type", "fishing_hook_type", "atlas_exile_citadel_index", "elder_guardian_index",
  "passive_jewel_radius",
]);
// "{0:+d}" as "+{0}", "{:d}" as the next "{N}"; Tencent's markup "[Thread|丝缕]" as what it shows. None for "{{".
const template = (s) => {
  if (s.includes("{{")) return undefined;
  let next = 0;
  return s
    .replace(/\{(\d*)(?::(\+?)d?)?\}/g, (_, n, plus) => `${plus ?? ""}{${n === "" ? next++ : n}}`)
    .replace(/\[([^\]|]*\|)?([^\]]*)\]/g, "$2")
    .replaceAll("\\n", "\n");
};
for (const file of FILES) {
  const english = new Map((enFiles[file] ?? []).map((e) => [e[1].join(" "), e[3]]));
  for (const e of zhFiles[file] ?? []) {
    const en = english.get(e[1].join(" "));
    if (!en || en.length !== e[3].length) continue;
    e[3].forEach((variant, i) => {
      const handlers = variant[4] ?? [];
      if (handlers.some(([h]) => OTHER.has(h))) return;
      const names = handlers.filter(([h]) => NAMES.has(h)).map(([, n]) => Number(n) - 1);
      add(template(en[i][1]), template(variant[1]), names);
    });
  }
}
console.log(`${fromCnPoeUtils} rows of cn-poe-utils, ${rows.length - fromCnPoeUtils} more of go-pob-data ${version}`);

const quote = (s) => `"${s.replaceAll('"', '""')}"`;
const csv = rows.map((r) => (r[2] ? r : r.slice(0, 2)).map(quote).join(",")).join("\n") + "\n";
mkdirSync(new URL(".", OUT), { recursive: true });
writeFileSync(OUT, csv);

// MessagePack, as much of it as go-pob-data's bundles use.
function decode(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  const utf8 = new TextDecoder();
  const str = (n) => utf8.decode(buf.subarray(pos, (pos += n)));
  const bin = (n) => buf.subarray(pos, (pos += n));
  const arr = (n) => Array.from({ length: n }, read);
  const map = (n) => {
    const o = {};
    for (let i = 0; i < n; i++) o[read()] = read();
    return o;
  };
  const u8 = () => view.getUint8(pos++);
  const u16 = () => ((pos += 2), view.getUint16(pos - 2));
  const u32 = () => ((pos += 4), view.getUint32(pos - 4));
  function read() {
    const b = u8();
    if (b <= 0x7f) return b;
    if (b <= 0x8f) return map(b & 0xf);
    if (b <= 0x9f) return arr(b & 0xf);
    if (b <= 0xbf) return str(b & 0x1f);
    if (b >= 0xe0) return b - 0x100;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(u8());
      case 0xc5: return bin(u16());
      case 0xc6: return bin(u32());
      case 0xca: return ((pos += 4), view.getFloat32(pos - 4));
      case 0xcb: return ((pos += 8), view.getFloat64(pos - 8));
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: return ((pos += 8), Number(view.getBigUint64(pos - 8)));
      case 0xd0: return ((pos += 1), view.getInt8(pos - 1));
      case 0xd1: return ((pos += 2), view.getInt16(pos - 2));
      case 0xd2: return ((pos += 4), view.getInt32(pos - 4));
      case 0xd3: return ((pos += 8), Number(view.getBigInt64(pos - 8)));
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return arr(u16());
      case 0xdd: return arr(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
    }
    throw new Error(`MessagePack: type 0x${b.toString(16)} at ${pos - 1}`);
  }
  return read();
}
