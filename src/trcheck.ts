// The translation check (Tools → AI translation check, in the build editor): the text of the open build that the
// dictionary has no translation for, translated by an AI on the user's machine (Pob.trFillStart, trfill.rs), kept in
// trs/<language>/POBT-ai.csv and, with GitHub's gh signed in, offered to POBT as a pull request (Pob.trSubmit).
import { readItems, tooltipOf } from "./editor/pages/items/data";
import { readSkills } from "./editor/pages/skills/data";
import type { AiProgress } from "./analysis";

/** A row the agent gave (trfill.rs `Row`): `why` it was not kept, "" when it was. */
export interface FillRow {
  en: string;
  zh: string;
  lines: string[];
  why: "" | "holes" | "noLine" | "known";
}

/** The translation running or last run (Pob.trFillProgress): its report, once done. */
export type FillProgress = Omit<AiProgress, "report"> & { report: { rows: FillRow[]; file: string; kept: number } | null };

const COLOUR = /\^(x[0-9A-Fa-f]{6}|[0-9])/g;

/** `text` without POB's colour codes. */
export const plainText = (text: string) => text.replace(COLOUR, "").trim();

/** The text of the open build the screens show, as POB writes it (colours kept, for the dictionary reads them): its
 * items' names, bases and tooltips' lines, and its skills' gems and what grants them. */
export async function buildTexts(): Promise<string[]> {
  const out: string[] = [];
  const add = (text?: string) => {
    for (const line of (text ?? "").split("\n")) if (plainText(line)) out.push(line.trim());
  };
  const items = await readItems();
  for (const item of items.items) {
    add(item.title);
    add(item.name);
    add(item.base);
    const tip = await tooltipOf(item.id).catch(() => null);
    for (const line of tip?.lines ?? []) add(line.text);
  }
  const first = await readSkills(1).catch(() => null);
  for (let group = 1; group <= (first?.groups.length ?? 0); group++) {
    const view = group === 1 ? first : await readSkills(group).catch(() => null);
    add(view?.groups[group - 1]?.source);
    for (const gem of view?.detail?.gems ?? []) add(gem.name);
  }
  return out;
}

export interface TrCheckStrings {
  open: string;
  title: string;
  back: string;
  scanning: string;
  missing: (n: number) => string;
  none: string;
  rescan: string;
  agent: string;
  noAgent: string;
  fill: string;
  hint: string;
  empty: string;
  failed: string;
  errors: Record<string, string>;
  kept: (n: number, file: string) => string;
  why: Record<FillRow["why"], string>;
  submit: string;
  submitting: string;
  submitted: string;
  noGh: string;
}

const STRINGS: Record<string, TrCheckStrings> = {
  en: {
    open: "AI translation check",
    title: "TRANSLATION CHECK",
    back: "Back to the build",
    scanning: "Reading the build's text…",
    missing: (n) => `${n} lines of this build have no translation`,
    none: "Every line of this build is translated.",
    rescan: "Check again",
    agent: "AI",
    noAgent: "Install Claude Code or Codex to translate them.",
    fill: "Translate with AI",
    hint: "The AI reads POBT's dictionary to word them as it does; each row is checked before it is kept.",
    empty: "The AI's translations show here.",
    failed: "The translation did not finish",
    errors: {
      nothingMissing: "Nothing to translate",
      noDictionary: "The dictionary's folder is missing",
      noAgent: "No AI is installed",
      cancelled: "Stopped",
      timedOut: "The AI took over 15 minutes and was stopped",
    },
    kept: (n, file) => `${n} rows kept in ${file}; the screens use them already.`,
    why: { "": "Kept", holes: "Its {0} holes differ", noLine: "Translates no line of the build", known: "Already there" },
    submit: "Offer them to POBT (pull request)",
    submitting: "Opening a pull request with gh…",
    submitted: "Pull request opened",
    noGh: "Sign in to GitHub's gh to offer them to POBT; they are kept here meanwhile.",
  },
  "zh-rCN": {
    open: "AI 翻译检查",
    title: "翻译检查",
    back: "返回构筑",
    scanning: "正在读取构筑的文字…",
    missing: (n) => `这个构筑有 ${n} 行没有翻译`,
    none: "这个构筑的每一行都有翻译。",
    rescan: "重新检查",
    agent: "AI",
    noAgent: "安装 Claude Code 或 Codex 后即可补译。",
    fill: "用 AI 补译",
    hint: "AI 会先查阅 POBT 的词典，按词典的用词翻译；每一行都经过校验才会保存。",
    empty: "AI 的翻译会显示在这里。",
    failed: "补译没有完成",
    errors: {
      nothingMissing: "没有需要翻译的内容",
      noDictionary: "找不到词典文件夹",
      noAgent: "没有安装 AI",
      cancelled: "已停止",
      timedOut: "AI 超过 15 分钟未完成，已停止",
    },
    kept: (n, file) => `已保存 ${n} 行到 ${file}，界面已经在用了。`,
    why: { "": "已保存", holes: "{0} 占位符对不上", noLine: "翻译不了构筑里的任何一行", known: "已有" },
    submit: "提交给 POBT（Pull Request）",
    submitting: "正在用 gh 提交 Pull Request…",
    submitted: "Pull Request 已提交",
    noGh: "登录 GitHub 的 gh 后可提交给 POBT；在此之前只在本机生效。",
  },
  "zh-rTW": {
    open: "AI 翻譯檢查",
    title: "翻譯檢查",
    back: "返回構築",
    scanning: "正在讀取構築的文字…",
    missing: (n) => `這個構築有 ${n} 行沒有翻譯`,
    none: "這個構築的每一行都有翻譯。",
    rescan: "重新檢查",
    agent: "AI",
    noAgent: "安裝 Claude Code 或 Codex 後即可補譯。",
    fill: "用 AI 補譯",
    hint: "AI 會先查閱 POBT 的詞典，按詞典的用詞翻譯；每一行都經過校驗才會儲存。",
    empty: "AI 的翻譯會顯示在這裡。",
    failed: "補譯沒有完成",
    errors: {
      nothingMissing: "沒有需要翻譯的內容",
      noDictionary: "找不到詞典資料夾",
      noAgent: "沒有安裝 AI",
      cancelled: "已停止",
      timedOut: "AI 超過 15 分鐘未完成，已停止",
    },
    kept: (n, file) => `已儲存 ${n} 行到 ${file}，介面已經在用了。`,
    why: { "": "已儲存", holes: "{0} 佔位符對不上", noLine: "翻譯不了構築裡的任何一行", known: "已有" },
    submit: "提交給 POBT（Pull Request）",
    submitting: "正在用 gh 提交 Pull Request…",
    submitted: "Pull Request 已提交",
    noGh: "登入 GitHub 的 gh 後可提交給 POBT；在此之前只在本機生效。",
  },
  "ko-KR": {
    open: "AI 번역 검사",
    title: "번역 검사",
    back: "빌드로 돌아가기",
    scanning: "빌드의 텍스트를 읽는 중…",
    missing: (n) => `이 빌드에 번역되지 않은 줄이 ${n}개 있습니다`,
    none: "이 빌드의 모든 줄이 번역되어 있습니다.",
    rescan: "다시 검사",
    agent: "AI",
    noAgent: "Claude Code 또는 Codex를 설치하면 번역할 수 있습니다.",
    fill: "AI로 번역",
    hint: "AI가 POBT 사전을 먼저 읽고 그 표현대로 번역합니다. 각 줄은 검사를 거쳐 저장됩니다.",
    empty: "AI의 번역이 여기에 표시됩니다.",
    failed: "번역이 끝나지 않았습니다",
    errors: {
      nothingMissing: "번역할 내용이 없습니다",
      noDictionary: "사전 폴더가 없습니다",
      noAgent: "설치된 AI가 없습니다",
      cancelled: "중지됨",
      timedOut: "AI가 15분 넘게 걸려 중지했습니다",
    },
    kept: (n, file) => `${n}줄을 ${file}에 저장했습니다. 화면에 이미 적용되었습니다.`,
    why: { "": "저장됨", holes: "{0} 자리 표시자가 다름", noLine: "빌드의 어떤 줄도 번역하지 않음", known: "이미 있음" },
    submit: "POBT에 제출 (Pull Request)",
    submitting: "gh로 Pull Request를 여는 중…",
    submitted: "Pull Request를 열었습니다",
    noGh: "GitHub의 gh에 로그인하면 POBT에 제출할 수 있습니다. 그 전에는 이 컴퓨터에서만 적용됩니다.",
  },
};

export function trCheckStrings(language: string | null): TrCheckStrings {
  return STRINGS[language ?? "en"] ?? STRINGS.en;
}

/** The words for a translation's error code (trfill.rs's or ai.rs's), or the error itself. */
export function fillErrorText(s: TrCheckStrings, error: string): string {
  if (error.startsWith("agentFailed: ")) return error.slice("agentFailed: ".length);
  return s.errors[error] ?? error;
}
