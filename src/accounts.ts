// Characters from an account on Path of Exile's site or Tencent's, made Path of Building builds (`Pob.accountStart`):
// the launcher's Characters page, its words in each language, and what the native side gives it.

export type Realm = "pc" | "xbox" | "sony" | "tencent";

export const REALMS: Realm[] = ["pc", "xbox", "sony", "tencent"];

/** Tencent's site, where its players sign in for their POESESSID. */
export const TENCENT_SITE = "https://poe.game.qq.com/";
export const PC_SITE = "https://www.pathofexile.com/";

export interface Account {
  realm: Realm;
  name: string;
  sessid: string;
}

/** A character as the site lists it. */
export interface Character {
  name: string;
  league: string;
  class: string;
  level: number;
  classId?: number;
  ascendancyClass?: number;
}

/** An account job, as `Pob.accountProgress` reports it. */
export interface AccountProgress {
  kind: "characters" | "export";
  state: "running" | "done" | "failed";
  step: string;
  error: string;
  result: any;
}

export interface AccountStrings {
  open: string;
  title: string;
  realms: Record<Realm, string>;
  accountName: string;
  accountHint: (realm: Realm) => string;
  sessid: string;
  sessidHint: (realm: Realm) => string;
  signIn: string;
  fetch: string;
  saved: string;
  none: string;
  remove: string;
  all: string;
  level: (n: number) => string;
  copyCode: string;
  saveToPob: string;
  empty: string;
  copied: string;
  savedTo: (path: string) => string;
  untranslated: (n: number) => string;
  steps: Record<string, string>;
  errors: Record<string, string>;
  login: (realm: Realm) => string;
  network: (e: string) => string;
}

const STRINGS: Record<string, AccountStrings> = {
  en: {
    open: "Import characters",
    title: "CHARACTERS",
    realms: { pc: "PC", xbox: "Xbox", sony: "PlayStation", tencent: "Tencent" },
    accountName: "Account name",
    accountHint: (r) => (r === "tencent" ? "Optional with POESESSID" : "Name#1234"),
    sessid: "POESESSID",
    sessidHint: (r) =>
      r === "tencent"
        ? "Required: the POESESSID cookie of poe.game.qq.com, once signed in (F12 → Application → Cookies)"
        : "Optional: for a private profile, the POESESSID cookie of pathofexile.com",
    signIn: "Open the site",
    fetch: "Get characters",
    saved: "ACCOUNTS",
    none: "No account yet",
    remove: "Remove",
    all: "All",
    level: (n) => `Level ${n}`,
    copyCode: "Copy code",
    saveToPob: "Save to POB",
    empty: "Characters of the account show here",
    copied: "Build code copied: paste it in Path of Building's Import/Export Build",
    savedTo: (p) => `Saved to ${p}: open it from Path of Building's builds`,
    untranslated: (n) => `${n} lines of mods are left untranslated`,
    steps: {
      account: "Finding the account…",
      characters: "Getting the characters…",
      items: "Getting items and passives…",
      translating: "Translating items…",
      loading: "Loading Path of Building…",
      importing: "Importing…",
      saving: "Saving…",
    },
    errors: {
      needSessid: "Tencent needs the account's POESESSID",
      needAccount: "Enter the account name",
      private: "The profile is private, or the POESESSID is wrong: make the characters public or enter the POESESSID",
      notFound: "No such account or character",
      rateLimited: "Too many requests: try again in a minute",
      noCharacters: "The account has no characters",
      noPob: "Choose or install Path of Building for Path of Exile first",
      restart: "Path of Building is running or another one is loaded: restart POBT to export",
    },
    login: (r) =>
      r === "tencent"
        ? "The POESESSID has expired or is wrong: sign in to the site again and copy it"
        : "The site asked for a browser check: try again later, or enter the POESESSID",
    network: (e) => `Network error: ${e}`,
  },
  "zh-rCN": {
    open: "角色导入",
    title: "角色导入",
    realms: { pc: "国际服", xbox: "Xbox", sony: "PlayStation", tencent: "腾讯服" },
    accountName: "账号名",
    accountHint: (r) => (r === "tencent" ? "填写 POESESSID 时可不填" : "Name#1234"),
    sessid: "POESESSID",
    sessidHint: (r) =>
      r === "tencent"
        ? "必填：登录 poe.game.qq.com 后浏览器中名为 POESESSID 的 Cookie（F12 → 应用 → Cookie）"
        : "可选：角色资料设为私密时需要，pathofexile.com 的 POESESSID Cookie",
    signIn: "打开官网",
    fetch: "获取角色",
    saved: "已保存的账号",
    none: "还没有账号",
    remove: "移除",
    all: "全部",
    level: (n) => `等级 ${n}`,
    copyCode: "复制代码",
    saveToPob: "保存到 POB",
    empty: "账号的角色会显示在这里",
    copied: "已复制 POB 代码，可在 Path of Building 的「导入/导出构筑」中粘贴",
    savedTo: (p) => `已保存到 ${p}，可在 Path of Building 的构筑列表中打开`,
    untranslated: (n) => `有 ${n} 行词缀未能翻译`,
    steps: {
      account: "查找账号…",
      characters: "获取角色列表…",
      items: "获取装备和天赋…",
      translating: "翻译物品…",
      loading: "加载 Path of Building…",
      importing: "导入角色…",
      saving: "保存构筑…",
    },
    errors: {
      needSessid: "腾讯服需要填写 POESESSID",
      needAccount: "请填写账号名",
      private: "角色资料是私密的，或 POESESSID 无效：请在官网公开角色，或填写 POESESSID",
      notFound: "找不到这个账号或角色",
      rateLimited: "请求太频繁，请稍后再试",
      noCharacters: "这个账号没有角色",
      noPob: "请先在主界面选择或安装流放之路的 Path of Building",
      restart: "Path of Building 正在运行或已加载另一个版本，请重启 POBT 后再导出",
    },
    login: (r) =>
      r === "tencent" ? "POESESSID 无效或已过期，请重新登录官网后复制" : "官网要求浏览器验证，请稍后再试或填写 POESESSID",
    network: (e) => `网络错误：${e}`,
  },
  "zh-rTW": {
    open: "角色匯入",
    title: "角色匯入",
    realms: { pc: "國際服", xbox: "Xbox", sony: "PlayStation", tencent: "騰訊服" },
    accountName: "帳號名稱",
    accountHint: (r) => (r === "tencent" ? "填寫 POESESSID 時可不填" : "Name#1234"),
    sessid: "POESESSID",
    sessidHint: (r) =>
      r === "tencent"
        ? "必填：登入 poe.game.qq.com 後瀏覽器中名為 POESESSID 的 Cookie（F12 → 應用程式 → Cookie）"
        : "選填：角色資料設為私密時需要，pathofexile.com 的 POESESSID Cookie",
    signIn: "打開官網",
    fetch: "取得角色",
    saved: "已儲存的帳號",
    none: "還沒有帳號",
    remove: "移除",
    all: "全部",
    level: (n) => `等級 ${n}`,
    copyCode: "複製代碼",
    saveToPob: "儲存到 POB",
    empty: "帳號的角色會顯示在這裡",
    copied: "已複製 POB 代碼，可在 Path of Building 的「匯入/匯出構築」中貼上",
    savedTo: (p) => `已儲存到 ${p}，可在 Path of Building 的構築列表中打開`,
    untranslated: (n) => `有 ${n} 行詞綴未能翻譯`,
    steps: {
      account: "尋找帳號…",
      characters: "取得角色列表…",
      items: "取得裝備和天賦…",
      translating: "翻譯物品…",
      loading: "載入 Path of Building…",
      importing: "匯入角色…",
      saving: "儲存構築…",
    },
    errors: {
      needSessid: "騰訊服需要填寫 POESESSID",
      needAccount: "請填寫帳號名稱",
      private: "角色資料是私密的，或 POESESSID 無效：請在官網公開角色，或填寫 POESESSID",
      notFound: "找不到這個帳號或角色",
      rateLimited: "請求太頻繁，請稍後再試",
      noCharacters: "這個帳號沒有角色",
      noPob: "請先在主介面選擇或安裝流亡黯道的 Path of Building",
      restart: "Path of Building 正在執行或已載入另一個版本，請重新啟動 POBT 後再匯出",
    },
    login: (r) =>
      r === "tencent" ? "POESESSID 無效或已過期，請重新登入官網後複製" : "官網要求瀏覽器驗證，請稍後再試或填寫 POESESSID",
    network: (e) => `網路錯誤：${e}`,
  },
  "ko-KR": {
    open: "캐릭터 가져오기",
    title: "캐릭터 가져오기",
    realms: { pc: "PC", xbox: "Xbox", sony: "PlayStation", tencent: "텐센트" },
    accountName: "계정 이름",
    accountHint: (r) => (r === "tencent" ? "POESESSID가 있으면 생략 가능" : "Name#1234"),
    sessid: "POESESSID",
    sessidHint: (r) =>
      r === "tencent"
        ? "필수: poe.game.qq.com에 로그인한 뒤 브라우저의 POESESSID 쿠키 (F12 → 애플리케이션 → 쿠키)"
        : "선택: 비공개 프로필일 때 pathofexile.com의 POESESSID 쿠키",
    signIn: "사이트 열기",
    fetch: "캐릭터 불러오기",
    saved: "저장된 계정",
    none: "아직 계정이 없습니다",
    remove: "삭제",
    all: "전체",
    level: (n) => `레벨 ${n}`,
    copyCode: "코드 복사",
    saveToPob: "POB에 저장",
    empty: "계정의 캐릭터가 여기에 표시됩니다",
    copied: "빌드 코드를 복사했습니다: Path of Building의 빌드 가져오기/내보내기에 붙여넣으세요",
    savedTo: (p) => `${p}에 저장했습니다: Path of Building의 빌드 목록에서 여세요`,
    untranslated: (n) => `옵션 ${n}줄을 번역하지 못했습니다`,
    steps: {
      account: "계정 찾는 중…",
      characters: "캐릭터 불러오는 중…",
      items: "장비와 패시브 불러오는 중…",
      translating: "아이템 번역 중…",
      loading: "Path of Building 불러오는 중…",
      importing: "가져오는 중…",
      saving: "저장 중…",
    },
    errors: {
      needSessid: "텐센트 서버는 POESESSID가 필요합니다",
      needAccount: "계정 이름을 입력하세요",
      private: "프로필이 비공개이거나 POESESSID가 잘못되었습니다: 캐릭터를 공개하거나 POESESSID를 입력하세요",
      notFound: "계정이나 캐릭터를 찾을 수 없습니다",
      rateLimited: "요청이 너무 많습니다: 잠시 후 다시 시도하세요",
      noCharacters: "계정에 캐릭터가 없습니다",
      noPob: "먼저 패스 오브 엑자일의 Path of Building을 선택하거나 설치하세요",
      restart: "Path of Building이 실행 중이거나 다른 버전이 로드되었습니다: POBT를 다시 시작한 뒤 내보내세요",
    },
    login: (r) =>
      r === "tencent"
        ? "POESESSID가 만료되었거나 잘못되었습니다: 사이트에 다시 로그인해 복사하세요"
        : "사이트가 브라우저 확인을 요구했습니다: 나중에 다시 시도하거나 POESESSID를 입력하세요",
    network: (e) => `네트워크 오류: ${e}`,
  },
};

export function accountStrings(language: string | null): AccountStrings {
  return STRINGS[language ?? "en"] ?? STRINGS.en;
}

/** The words for a job's error code (`account.rs`'s), or the error itself. */
export function errorText(s: AccountStrings, realm: Realm, error: string): string {
  if (error === "login") return s.login(realm);
  if (error.startsWith("network: ")) return s.network(error.slice("network: ".length));
  return s.errors[error] ?? error;
}

/** Polls the account job until it ends, then `done`; `each` hears it as it runs. */
export function watchJob(poll: () => string, each: (p: AccountProgress | null) => void, done: (p: AccountProgress) => void) {
  const tick = () => {
    const json = poll();
    const p: AccountProgress | null = json ? JSON.parse(json) : null;
    each(p);
    if (!p) return;
    if (p.state === "running") setTimeout(tick, 150);
    else done(p);
  };
  tick();
}
