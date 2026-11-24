// What only POBT says on the Calcs page, by language (`language()`); Path of Building's own words go through tr().
import { language } from "../../i18n";

const EN = {
  breakdown: "Breakdown",
  hint: "Press the cell to pin this breakdown beside it.",
  noBreakdown: "No breakdown for this row.",
  pinned: "Pinned",
  preview: "Preview",
  unpin: "Unpin",
  backToPinned: "Pinned: {0} · leave the row to go back",
  notApplicable: "not applicable",
  showAll: "Show all sections",
  search: "Search stats",
  noMatch: "No stat matches the search.",
  moreSources: "+ {0} more sources",
  calculating: "Calculating",
  failed: "The Calcs calculation failed",
  buffs: "Buffs and debuffs",
  loading: "Loading the breakdown",
};

type Key = keyof typeof EN;

const STRINGS: Record<string, Partial<Record<Key, string>>> = {
  "zh-rCN": {
    breakdown: "明细",
    hint: "点按该格可把明细固定在旁边。",
    noBreakdown: "这一行没有明细。",
    pinned: "已固定",
    preview: "预览",
    unpin: "取消固定",
    backToPinned: "已固定：{0} · 移开指针即可返回",
    notApplicable: "不适用",
    showAll: "显示全部分区",
    search: "搜索数值",
    noMatch: "没有匹配的数值。",
    moreSources: "另有 {0} 个来源",
    calculating: "正在计算",
    failed: "计算页的计算失败了",
    buffs: "增益与减益",
    loading: "正在读取明细",
  },
  "zh-rTW": {
    breakdown: "明細",
    hint: "點按該格可把明細固定在旁邊。",
    noBreakdown: "這一列沒有明細。",
    pinned: "已固定",
    preview: "預覽",
    unpin: "取消固定",
    backToPinned: "已固定：{0} · 移開指標即可返回",
    notApplicable: "不適用",
    showAll: "顯示全部區塊",
    search: "搜尋數值",
    noMatch: "沒有符合的數值。",
    moreSources: "另有 {0} 個來源",
    calculating: "正在計算",
    failed: "計算頁的計算失敗了",
    buffs: "增益與減益",
    loading: "正在讀取明細",
  },
  "ko-KR": {
    breakdown: "세부 내역",
    hint: "칸을 누르면 이 세부 내역이 옆에 고정됩니다.",
    noBreakdown: "이 행에는 세부 내역이 없습니다.",
    pinned: "고정됨",
    preview: "미리 보기",
    unpin: "고정 해제",
    backToPinned: "고정됨: {0} · 행에서 벗어나면 돌아갑니다",
    notApplicable: "해당 없음",
    showAll: "모든 섹션 표시",
    search: "능력치 검색",
    noMatch: "검색과 일치하는 능력치가 없습니다.",
    moreSources: "외 {0}개 출처",
    calculating: "계산 중",
    failed: "계산 탭의 계산이 실패했습니다",
    buffs: "버프와 디버프",
    loading: "세부 내역 불러오는 중",
  },
};

/** A POBT string of the Calcs page in the language in use, `{0}` replaced by `arg`; reactive. */
export function s(key: Key, arg?: string | number): string {
  const lang = language();
  const text = (lang && STRINGS[lang]?.[key]) || EN[key];
  return arg === undefined ? text : text.replace("{0}", String(arg));
}
