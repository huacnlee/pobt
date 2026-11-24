// What the Skills page reads from Path of Building (ext/pobt-native/src/service/skills.lua), and what only the page
// says in each language. Names, labels and slots stay as POB writes them (English) and are translated with tr().
import { language, tr } from "../../i18n";
import { pob, type Control } from "../../session";

/** A line of a tooltip POB filled (GemTooltip.AddGemTooltip, SkillsTab:AddSocketGroupTooltip). */
export type TipLine = { text?: string; size?: number; sep?: boolean };

/** A gem's attribute, the theme's gem colour it is drawn in. */
export type Attr = "str" | "dex" | "int" | "white";

/** A gem's row of controls in POB's Skills tab: its numbers are the edit boxes' own text. */
export type GemControls = {
  level: Control;
  quality: Control;
  enabled: Control;
  count: Control;
  enableGlobal1: Control;
  enableGlobal2: Control;
  delete: Control;
};

export type Gem = {
  /** POB's gem id (data.gems), absent for a gem POB does not know. */
  id?: string;
  name: string;
  attr: Attr;
  known: boolean;
  enabled: boolean;
  support: boolean;
  errMsg?: string;
  tip?: TipLine[];
  controls: GemControls;
};

export type Group = {
  label: string;
  displayLabel: string;
  enabled: boolean;
  slotEnabled: boolean;
  includeInFullDPS: boolean;
  slot?: string;
  /** What grants the group (an item's or a passive's name): its gems cannot be changed. */
  source?: string;
  /** The name of the group's first active skill gem, for its picture. */
  activeGem?: string;
  count: number;
};

export type Detail = {
  /** The group shown, 1-based. */
  index: number;
  label: Control;
  slot: Control;
  enabled: Control;
  includeInFullDPS: Control;
  /** "Count:" of a group an item or a passive grants. */
  count: Control;
  /** "Item sockets: …" (its label), and the "Optimise Sockets" button; missing on PoE2's POB, as the imbued support. */
  sockets?: Control;
  optimiseSockets?: Control;
  /** What POB says of a group an item or a passive grants (its label). */
  sourceNote: Control;
  imbuedLabel?: Control;
  imbued?: Control;
  imbuedClear?: Control;
  gems: Gem[];
};

/** The tab's "Gem Options", each with the label POB draws beside it. */
export type Options = {
  sortGemsByDPS: Control;
  sortGemsByDPSField: Control;
  defaultLevel: Control;
  defaultQuality: Control;
  showSupportGemTypes: Control;
  showLegacyGems: Control;
};

export type SkillsView = {
  options: Options;
  sets: string[];
  /** 1-based, as POB's set drop-down. */
  activeSet: number;
  /** The main socket group, 1-based (build.mainSocketGroup). */
  main: number;
  groups: Group[];
  detail: Detail | null;
};

/** A gem POB's gem selector offers for the group. */
export type GemChoice = { id: string; name: string; attr: Attr; support: boolean; canSupport: boolean };

export const readSkills = (group: number) => pob<SkillsView>("skills.read", { group });
export const gemChoices = (group: number, imbued = false) => pob<GemChoice[]>("skills.gems", { group, imbued });

/** What POB's tooltip says (skills.tip): `what` is "group", "choice", or a gem's "quality", "enabled", "count",
 * "delete", or a group's "optimiseSockets", "imbuedClear". */
export const tipOf = async (args: { what: string; group: number; gem?: number; id?: string; imbued?: boolean }) =>
  (await pob<{ lines: TipLine[] }>("skills.tip", args)).lines;

/** The text class of a gem's attribute colour. */
export const GEM_TEXT: Record<Attr, string> = {
  str: "text-gem-str",
  dex: "text-gem-dex",
  int: "text-gem-int",
  white: "text-gem-white",
};


/** A group's name as POB's list shows it: its label, or the names of its active skills, translated. */
export function groupTitle(g: Group): string {
  const text = g.displayLabel || g.label;
  if (!text) return tr("<No active skills>");
  return text
    .split(", ")
    .map((part) => tr(part))
    .join(", ");
}

/** A slot's name ("Weapon 1 Swap" as "Weapon 1 (Swap)", the form POB's dictionaries know). */
export function slotTitle(slot: string): string {
  const swap = slot.match(/^(.*) Swap$/);
  return swap ? tr(`${swap[1]} (Swap)`) : tr(slot);
}

const STRINGS = {
  en: {
    settings: "Group settings",
    groups: "Socket groups",
    newGroup: "New group",
    setMain: "Set as main skill",
    isMain: "Main skill",
    addGem: "Add a gem",
    active: "Active gems",
    support: "Support gems",
    supportsThis: "Supports this group",
    imbuedNone: "No imbued support",
    deleteGroup: "Delete group",
    confirmDelete: "Delete this group?",
    removeGem: "Remove gem",
    unknownGem: "Not a gem Path of Building knows",
    granted: "Granted by",
    grantedHint: "Gems granted by an item or a passive cannot be changed here.",
    noGroup: "No socket group selected",
    noGroups: "This skill set has no socket groups.",
    disabled: "Disabled",
    fullDps: "Full DPS",
  },
  "zh-rCN": {
    settings: "插槽组设置",
    groups: "插槽组",
    newGroup: "新建插槽组",
    setMain: "设为主技能",
    isMain: "主技能",
    addGem: "添加宝石",
    active: "主动宝石",
    support: "辅助宝石",
    supportsThis: "可辅助本组",
    imbuedNone: "无灌注辅助",
    deleteGroup: "删除插槽组",
    confirmDelete: "确定删除该插槽组？",
    removeGem: "移除宝石",
    unknownGem: "Path of Building 不认识这颗宝石",
    granted: "来自",
    grantedHint: "物品或天赋给予的宝石不能在这里修改。",
    noGroup: "未选择插槽组",
    noGroups: "这个技能集没有插槽组。",
    disabled: "已禁用",
    fullDps: "最终总和DPS",
  },
  "zh-rTW": {
    settings: "插槽組設定",
    groups: "插槽組",
    newGroup: "新增插槽組",
    setMain: "設為主技能",
    isMain: "主技能",
    addGem: "新增寶石",
    active: "主動寶石",
    support: "輔助寶石",
    supportsThis: "可輔助本組",
    imbuedNone: "無灌注輔助",
    deleteGroup: "刪除插槽組",
    confirmDelete: "確定刪除此插槽組？",
    removeGem: "移除寶石",
    unknownGem: "Path of Building 不認識這顆寶石",
    granted: "來自",
    grantedHint: "物品或天賦給予的寶石無法在此修改。",
    noGroup: "未選擇插槽組",
    noGroups: "此技能集沒有插槽組。",
    disabled: "已停用",
    fullDps: "最終總和DPS",
  },
  "ko-KR": {
    settings: "그룹 설정",
    groups: "소켓 그룹",
    newGroup: "새 그룹",
    setMain: "주 스킬로 설정",
    isMain: "주 스킬",
    addGem: "젬 추가",
    active: "액티브 젬",
    support: "보조 젬",
    supportsThis: "이 그룹 보조 가능",
    imbuedNone: "주입된 보조 없음",
    deleteGroup: "그룹 삭제",
    confirmDelete: "이 그룹을 삭제할까요?",
    removeGem: "젬 제거",
    unknownGem: "Path of Building이 모르는 젬",
    granted: "부여:",
    grantedHint: "아이템이나 패시브가 부여한 젬은 여기서 바꿀 수 없습니다.",
    noGroup: "선택한 소켓 그룹 없음",
    noGroups: "이 스킬 세트에는 소켓 그룹이 없습니다.",
    disabled: "비활성",
    fullDps: "전체 DPS",
  },
};

/** What only this page says, in the language in use; reactive. */
export function s(key: keyof (typeof STRINGS)["en"]): string {
  const lang = language();
  return (lang && STRINGS[lang as keyof typeof STRINGS]?.[key]) || STRINGS.en[key];
}
