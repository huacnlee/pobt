// The smart loot filter page's work (Tools → Smart loot filter): the league's prices from poe.ninja, through the Rust
// extension, made into a filter by the market's own code (market/src), written where the game reads filters.
import { Pob } from "pobt/native";
import { countRules, generateFilter, MIN_WORTH, tiers, type Strictness } from "../market/src/filter";
import { parsePage, sources, toSnapshot } from "../market/src/ninja";
import type { Price } from "../market/src/types";

export { MIN_WORTH, type Strictness };
export const STRICTNESS: Strictness[] = ["soft", "regular", "strict"];

/** What a generated filter is: where it went and what it was made from. */
export interface FilterResult {
  league: string;
  at: string;
  divine: number;
  path: string;
  /** Rules per tier, best first: the tier's label and how many rules show at its look. */
  tiers: { label: string; rules: number }[];
  /** All rules in the file, shown and hidden. */
  rules: number;
}

async function get(url: string): Promise<unknown> {
  const out = JSON.parse((await Pob.marketFetch(url)) || '{"error":"no answer"}') as { body?: string; error?: string };
  if (out.error !== undefined) throw new Error(out.error);
  return JSON.parse(out.body!);
}

/** The challenge league, as market/src/ninja.ts picks it. */
async function league(): Promise<string> {
  const state = (await get("https://poe.ninja/poe1/api/data/index-state")) as { economyLeagues: { name: string }[] };
  return state.economyLeagues.find((l) => !/^(Standard|Hardcore)$|Hardcore|^HC /i.test(l.name))?.name ?? "Standard";
}

/** Prices now, a filter from them, written: `onStep` is told each page done (of `sources().length`). */
export async function makeFilter(strictness: Strictness, minWorth: number | undefined, onStep: (done: number, of: number) => void): Promise<FilterResult> {
  const name = await league();
  const pages = sources(name);
  const prices: Price[] = [];
  for (const [i, source] of pages.entries()) {
    prices.push(...parsePage(source, await get(source.url)));
    onStep(i + 1, pages.length);
  }
  const snapshot = toSnapshot(name, new Date().toISOString(), prices);
  const text = generateFilter(snapshot, { strictness, minWorth });
  const written = JSON.parse(Pob.writeFilter(text)) as { path?: string; error?: string };
  if (written.error !== undefined) throw new Error(written.error);
  const counts = countRules(text);
  const levels = tiers(snapshot.divine, minWorth ?? MIN_WORTH[strictness]);
  return {
    league: name,
    at: snapshot.at,
    divine: snapshot.divine,
    path: written.path!,
    tiers: levels.map((t) => ({ label: t.label, rules: counts.byTier.get(t.id) ?? 0 })),
    rules: counts.total,
  };
}

export interface FilterStrings {
  open: string;
  title: string;
  back: string;
  intro: string;
  strictness: string;
  levels: Record<Strictness, string>;
  levelHint: Record<Strictness, string>;
  custom: string;
  customHint: string;
  badNumber: string;
  generate: string;
  fetching: (done: number, of: number) => string;
  league: string;
  pricedAt: string;
  divine: (chaos: string) => string;
  tierRules: string;
  rules: (n: number) => string;
  total: (n: number) => string;
  written: string;
  reload: string;
  openFolder: string;
  empty: string;
  failed: (error: string) => string;
}

const STRINGS: Record<string, FilterStrings> = {
  en: {
    open: "Smart loot filter",
    title: "SMART LOOT FILTER",
    back: "Launcher",
    intro: "Shows each drop by what it sells for in the current league, from poe.ninja's prices.",
    strictness: "Strictness",
    levels: { soft: "Soft", regular: "Regular", strict: "Strict" },
    levelHint: { soft: "Leveling: hides drops under 0.5 c", regular: "Mapping: hides drops under 1 c", strict: "Late league: hides drops under 5 c" },
    custom: "Your own threshold (chaos)",
    customHint: "Leave empty to use the strictness",
    badNumber: "Enter a number of chaos, 0 or more",
    generate: "Generate",
    fetching: (d, o) => `Getting prices ${d} / ${o}`,
    league: "League",
    pricedAt: "Prices of",
    divine: (c) => `1 divine = ${c} c`,
    tierRules: "Rules by tier",
    rules: (n) => `${n} rules`,
    total: (n) => `${n} rules in all`,
    written: "Written to",
    reload: "In the game, choose POBT under Options → UI → Item Filter, or press Reload if it is already chosen.",
    openFolder: "Open folder",
    empty: "Choose a strictness and press Generate.",
    failed: (e) => `Could not make the filter: ${e}`,
  },
  "zh-rCN": {
    open: "智能拾取过滤器",
    title: "智能拾取过滤器",
    back: "返回主界面",
    intro: "按 poe.ninja 当前赛季的价格，把每件掉落按能卖多少钱显示。",
    strictness: "严格程度",
    levels: { soft: "宽松", regular: "常规", strict: "严格" },
    levelHint: { soft: "练级：隐藏低于 0.5 C 的掉落", regular: "刷图：隐藏低于 1 C 的掉落", strict: "赛季后期：隐藏低于 5 C 的掉落" },
    custom: "自定义价值门槛（C）",
    customHint: "留空则按严格程度",
    badNumber: "请输入不小于 0 的 C 数",
    generate: "生成",
    fetching: (d, o) => `正在获取价格 ${d} / ${o}`,
    league: "赛季",
    pricedAt: "价格时间",
    divine: (c) => `1 神圣 = ${c} C`,
    tierRules: "各档规则数",
    rules: (n) => `${n} 条规则`,
    total: (n) => `共 ${n} 条规则`,
    written: "已写入",
    reload: "在游戏里打开 选项 → 界面 → 物品过滤器，选择 POBT；已选中的话点重新载入。",
    openFolder: "打开目录",
    empty: "选择严格程度后点生成。",
    failed: (e) => `生成失败：${e}`,
  },
  "zh-rTW": {
    open: "智慧拾取過濾器",
    title: "智慧拾取過濾器",
    back: "返回主介面",
    intro: "依 poe.ninja 當前賽季的價格，把每件掉落依能賣多少錢顯示。",
    strictness: "嚴格程度",
    levels: { soft: "寬鬆", regular: "一般", strict: "嚴格" },
    levelHint: { soft: "練等：隱藏低於 0.5 C 的掉落", regular: "刷圖：隱藏低於 1 C 的掉落", strict: "賽季後期：隱藏低於 5 C 的掉落" },
    custom: "自訂價值門檻（C）",
    customHint: "留空則依嚴格程度",
    badNumber: "請輸入不小於 0 的 C 數",
    generate: "產生",
    fetching: (d, o) => `正在取得價格 ${d} / ${o}`,
    league: "賽季",
    pricedAt: "價格時間",
    divine: (c) => `1 神聖 = ${c} C`,
    tierRules: "各級規則數",
    rules: (n) => `${n} 條規則`,
    total: (n) => `共 ${n} 條規則`,
    written: "已寫入",
    reload: "在遊戲裡打開 選項 → 介面 → 物品過濾器，選擇 POBT；已選中的話點重新載入。",
    openFolder: "打開目錄",
    empty: "選擇嚴格程度後點產生。",
    failed: (e) => `產生失敗：${e}`,
  },
  "ko-KR": {
    open: "스마트 루트 필터",
    title: "스마트 루트 필터",
    back: "처음 화면",
    intro: "poe.ninja의 현재 리그 시세로, 드롭을 팔리는 값에 따라 보여 줍니다.",
    strictness: "엄격도",
    levels: { soft: "느슨함", regular: "보통", strict: "엄격" },
    levelHint: { soft: "레벨링: 0.5 c 미만 숨김", regular: "맵핑: 1 c 미만 숨김", strict: "리그 후반: 5 c 미만 숨김" },
    custom: "직접 정한 기준 (카오스)",
    customHint: "비워 두면 엄격도를 따릅니다",
    badNumber: "0 이상의 카오스 수를 입력하세요",
    generate: "생성",
    fetching: (d, o) => `시세 가져오는 중 ${d} / ${o}`,
    league: "리그",
    pricedAt: "시세 시각",
    divine: (c) => `1 신성 = ${c} c`,
    tierRules: "등급별 규칙 수",
    rules: (n) => `규칙 ${n}개`,
    total: (n) => `전체 규칙 ${n}개`,
    written: "저장 위치",
    reload: "게임에서 옵션 → UI → 아이템 필터에서 POBT를 고르거나, 이미 골랐다면 다시 불러오기를 누르세요.",
    openFolder: "폴더 열기",
    empty: "엄격도를 고르고 생성을 누르세요.",
    failed: (e) => `필터를 만들지 못했습니다: ${e}`,
  },
};

export function filterStrings(language: string | null): FilterStrings {
  return STRINGS[language ?? "en"] ?? STRINGS.en;
}
