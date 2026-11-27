// Writes src/market/data/names.zh-CN.json: the English name of every item the market prices, with the name Tencent's
// servers (国服) give it, which the market shows in Chinese. Run again when a league adds items:
//
//   bun scripts/tencent-names.ts [--league <name>]
//
// - Currency, fragments, cards and the rest of the exchange: by trade id. poe.ninja's exchange names its items by the
//   official trade site's ids, and Tencent's trade site lists the same ids with its words.
// - Uniques and bases: Tencent's lists have only Chinese, so PoeCharm2's dictionary (English → Chinese, the
//   translation POBT uses) leads there; its word is taken when Tencent has the same. A unique it words differently is
//   the one unique Tencent has on that base that nothing else took; a replica, its unique with 【仿品】. What still has
//   no Tencent name keeps PoeCharm2's, and the app words a Foulborn unique from the unique's name.
import { currentLeague, sources } from "../core/ninja";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TENCENT = "https://poe.game.qq.com/api/trade/data";
const POECHARM = "https://raw.githubusercontent.com/Chuanhsing/PoeCharm2/2b44c5780c6d39f52f5c95529a2b9536b85c152f/Data/Translate/zh-rCN";
const POECHARM_FILES = [
  "Uniques.txt.csv",
  "Items_Accessories.txt.csv",
  "Items_Armour.txt.csv",
  "Items_Flasks.txt.csv",
  "Items_Jewels.txt.csv",
  "Items_Weapons.txt.csv",
];
const OUT = new URL("../src/market/data/names.zh-CN.json", import.meta.url).pathname;

const args = process.argv.slice(2);
const league = args[0] === "--league" ? args[1] : await currentLeague();

async function json<T>(url: string, ua = "POBT"): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": ua } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** A CSV line's two fields (English, Chinese); quotes only where a field needs them. */
function csvPair(line: string): [string, string] | undefined {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") fields.push(field), (field = "");
    else field += c;
  }
  fields.push(field);
  return fields.length >= 2 && fields[0].trim() && fields[1].trim() ? [fields[0].trim(), fields[1].trim()] : undefined;
}

type TencentStatic = { result: { id: string; entries: { id: string; text: string }[] }[] };
type TencentItems = { result: { id: string; entries: { name?: string; type: string; flags?: { unique?: boolean } }[] }[] };

const [tencentStatic, tencentItems] = await Promise.all([
  json<TencentStatic>(`${TENCENT}/static`, UA),
  json<TencentItems>(`${TENCENT}/items`, UA),
]);
const byTradeId = new Map(tencentStatic.result.flatMap((g) => g.entries.map((e) => [e.id, e.text] as const)));
const tencentTypes = new Set<string>();
const tencentUniques = new Map<string, string[]>(); // base (Chinese) → uniques on it
for (const group of tencentItems.result) {
  for (const e of group.entries) {
    if (e.name) tencentUniques.set(e.type, [...(tencentUniques.get(e.type) ?? []), e.name]);
    else tencentTypes.add(e.type);
  }
}
const tencentUniqueNames = new Set([...tencentUniques.values()].flat());

const poecharm = new Map<string, string>();
for (const file of POECHARM_FILES) {
  const res = await fetch(`${POECHARM}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  for (const line of (await res.text()).split(/\r?\n/)) {
    const pair = csvPair(line);
    if (pair && !poecharm.has(pair[0])) poecharm.set(pair[0], pair[1]);
  }
}

const names = new Map<string, string>();
const uniques: { name: string; base: string }[] = [];
let exchange = 0;
for (const source of sources(league)) {
  if (source.market === "exchange") {
    const page = await json<{ items: { id: string; name: string }[] }>(source.url);
    for (const item of page.items) {
      const zh = byTradeId.get(item.id);
      if (zh && !names.has(item.name)) names.set(item.name, zh), exchange++;
    }
  } else {
    const page = await json<{ lines: { name: string; baseType?: string }[] }>(source.url);
    for (const line of page.lines) {
      if (source.kind === "unique" && line.baseType) uniques.push({ name: line.name, base: line.baseType });
      const base = line.baseType ?? line.name;
      const zh = poecharm.get(base);
      if (zh && tencentTypes.has(zh)) names.set(base, zh);
    }
  }
}

// Uniques: PoeCharm2's word when Tencent has it, then the one unique on the same base Tencent has left.
const taken = new Set<string>();
const pending: { name: string; base: string }[] = [];
for (const u of new Map(uniques.map((u) => [u.name, u])).values()) {
  const zh = poecharm.get(u.name);
  if (zh && tencentUniqueNames.has(zh)) names.set(u.name, zh), taken.add(zh);
  else pending.push(u);
}
// A replica is its unique with Tencent's 【仿品】.
for (const u of [...pending]) {
  const original = u.name.startsWith("Replica ") && names.get(u.name.slice(8));
  if (original && tencentUniqueNames.has(`${original}【仿品】`)) {
    names.set(u.name, `${original}【仿品】`);
    pending.splice(pending.indexOf(u), 1);
  }
}
let byBase = 0;
for (const u of pending) {
  const base = names.get(u.base) ?? poecharm.get(u.base);
  const left = (base && tencentUniques.get(base)?.filter((n) => !taken.has(n))) || [];
  const others = pending.filter((p) => p.base === u.base).length;
  if (left.length === 1 && others === 1) names.set(u.name, left[0]), taken.add(left[0]), byBase++;
  else if (poecharm.has(u.name)) names.set(u.name, poecharm.get(u.name)!);
}

const sorted = Object.fromEntries([...names].sort(([a], [b]) => a.localeCompare(b)));
await Bun.write(OUT, `${JSON.stringify(sorted, null, 0).replaceAll('","', '",\n"')}\n`);
console.log(`${league}: ${names.size} names (${exchange} by trade id, ${byBase} uniques by base) → ${OUT}`);
