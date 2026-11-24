// Characters from an account on Path of Exile's site or Tencent's, or from Path of Exile 2's API, made Path of Building
// builds (`Pob.accountStart`): the launcher's Characters page, its words in each language, and what the native side gives it.

/** Path of Exile's realms, and Path of Exile 2's: `poe2`, signed in to by OAuth, and `wegame`, Tencent's by a WeGame
 * share link (kept as `sessid`). */
export type Realm = "pc" | "xbox" | "sony" | "tencent" | "poe2" | "wegame";

/** Path of Exile's realms, to choose among. */
export const REALMS: Realm[] = ["pc", "xbox", "sony", "tencent"];
/** Path of Exile 2's. */
export const POE2_REALMS: Realm[] = ["poe2", "wegame"];

/** Tencent's site, where its players sign in for their POESESSID. */
export const TENCENT_SITE = "https://poe.game.qq.com/";
export const PC_SITE = "https://www.pathofexile.com/";

export interface Account {
  realm: Realm;
  name: string;
  sessid: string;
  /** Its characters as they were last got, and when (seconds since 1970). */
  characters?: Character[];
  updated?: number;
  /** Path of Exile 2's sign-in: its OAuth token, refresh token, and when the token expires. */
  token?: string;
  refresh?: string;
  expires?: number;
}

/** A character as the site lists it. */
export interface Character {
  name: string;
  league: string;
  class: string;
  level: number;
  classId?: number;
  ascendancyClass?: number;
  /** When it was last played, in seconds since 1970 (Tencent's list). */
  lastLoginTime?: number;
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
  /** Back from the page, to the launcher or Path of Building. */
  back: string;
  title: string;
  /** Path of Exile 2's characters: signing in to its site (OAuth); Tencent's, by a WeGame share link. */
  poe2: { title: string; body: string; signIn: string; share: { label: string; hint: string; fetch: string } };
  realms: Record<Realm, string>;
  accountName: string;
  accountHint: string;
  sessid: string;
  /** The POESESSID's text, shown or hidden. */
  show: string;
  hide: string;
  sessidHint: (realm: Realm) => string;
  /** How to get the POESESSID, step by step, for those who never opened a browser's tools. */
  guide: { link: string; title: string; steps: (realm: Realm) => string[]; warn: string; close: string };
  signIn: string;
  fetch: string;
  refresh: string;
  /** When the characters were got, from seconds since 1970. */
  updated: (seconds: number) => string;
  saved: string;
  none: string;
  remove: string;
  all: string;
  level: (n: number) => string;
  copyCode: string;
  /** Where to save a build, in POB's builds folder. */
  save: { title: string; root: string; name: string; hint: string; save: string; overwrite: string; replaces: (file: string) => string; cancel: string };
  saveToPob: string;
  empty: string;
  copied: string;
  /** A build saved, by its name. */
  savedTo: (name: string) => string;
  untranslated: (n: number) => string;
  steps: Record<string, string>;
  errors: Record<string, string>;
  login: (realm: Realm) => string;
  /** Too many requests to the realm's site; `wait`: the seconds it says to wait, or "". */
  rateLimited: (realm: Realm, wait: string) => string;
  network: (e: string) => string;
}

const STRINGS: Record<string, AccountStrings> = {
  en: {
    open: "Import characters",
    back: "Back",
    title: "CHARACTERS",
    poe2: {
      title: "PATH OF EXILE 2",
      body: "Path of Exile 2's characters come from its site's API, which an app may use once you let it in: sign in on pathofexile.com in your browser, as Path of Building 2 does. POBT keeps the sign-in, as Path of Building 2 would.",
      signIn: "Sign in and get characters",
      share: { label: "WeGame share link", hint: "Tencent: in WeGame's Path of Exile 2 helper, open the character's data, press Share (一键分享) and copy the link", fetch: "Get the character" },
    },
    realms: { pc: "PC", xbox: "Xbox", sony: "PS", tencent: "Tencent", poe2: "PC", wegame: "Tencent" },
    accountName: "Account name",
    accountHint: "Name#1234",
    sessid: "POESESSID",
    show: "Show",
    hide: "Hide",
    sessidHint: (r) =>
      r === "tencent"
        ? "Required: the POESESSID cookie of poe.game.qq.com, once signed in (F12 → Application → Cookies)"
        : "Optional: for a private profile, the POESESSID cookie of pathofexile.com",
    guide: {
      link: "How do I get it?",
      title: "Getting your POESESSID",
      steps: (r) => [
        `Press "Open the site" below and sign in to ${r === "tencent" ? "poe.game.qq.com" : "pathofexile.com"} with your account, in Chrome or Edge.`,
        "On the site, press F12: the developer tools open beside the page.",
        "At their top, choose Application (behind » if it is not shown). In Firefox it is Storage.",
        "On their left, open Cookies and choose the site's address under it.",
        "In the list, find the row named POESESSID. Double-click its Value, and copy it (Ctrl+C).",
        "Back in POBT, paste it in the POESESSID box (Ctrl+V) and press Get characters.",
      ],
      warn: "The POESESSID signs in as you: give it to no one. Signing out of the site ends it: copy the new one then.",
      close: "Got it",
    },
    signIn: "Open the site",
    fetch: "Get characters",
    refresh: "Update",
    updated: (s) => `Updated ${new Date(s * 1000).toLocaleString()}`,
    saved: "ACCOUNTS",
    none: "No account yet",
    remove: "Remove",
    all: "All",
    level: (n) => `Level ${n}`,
    copyCode: "Copy",
    save: { title: "Save to Path of Building", root: "Builds", name: "Build name", hint: "Choose a folder for a new build, or a build to replace", save: "Save", overwrite: "Replace", replaces: (f) => `Replaces ${f}`, cancel: "Cancel" },
    saveToPob: "Save",
    empty: "Characters of the account show here",
    copied: "Build code copied",
    savedTo: (n) => `Saved: ${n}`,
    untranslated: (n) => `${n} lines of mods are left untranslated`,
    steps: {
      account: "Finding the account…",
      characters: "Getting the characters…",
      items: "Getting items and passives…",
      translating: "Translating items…",
      loading: "Loading Path of Building…",
      importing: "Importing…",
      saving: "Saving…",
      signin: "Waiting for you to sign in, in the browser…",
    },
    errors: {
      needSessid: "Tencent needs the account's POESESSID",
      needAccount: "Enter the account name",
      private: "The profile is private, or the POESESSID is wrong: make the characters public or enter the POESESSID",
      notFound: "No such account or character",
      noCharacters: "The account has no characters",
      noPob: "Choose or install Path of Building for Path of Exile first",
      restart: "Another Path of Building is loaded (the other game's): restart POBT to export",
      noPob2: "Choose or install Path of Building for Path of Exile 2 first",
      signinTimeout: "Not signed in in time: try again",
      signinDenied: "POBT was not let in on the site",
      signinFailed: "Signing in failed: try again",
      signinPort: "Cannot wait for the sign-in: ports 49082 to 49084 are in use (Path of Building 2 may be signing in)",
      needShare: "Paste a WeGame share link",
      shareExpired: "WeGame does not know the share link, or it has expired: share the character again",
      blocked: "Path of Exile's site turned POBT away with a browser check (Cloudflare), as it does on some networks: try again later, or on another network",
    },
    rateLimited: (r, wait) =>
      (r === "tencent"
        ? "Too many requests: Tencent allows an account 10 a minute and 50 in half an hour"
        : "Too many requests: the Path of Exile site limits how many an account makes") +
      (wait ? `. Try again in ${wait} s` : ". Try again in a while"),
    login: (r) =>
      r === "tencent"
        ? "The POESESSID has expired or is wrong: sign in to the site again and copy it"
        : "The site asked for a browser check: try again later, or enter the POESESSID",
    network: (e) => `Network error: ${e}`,
  },
  "zh-rCN": {
    open: "角色导入",
    back: "返回",
    title: "角色导入",
    poe2: {
      title: "流放之路 2",
      body: "流放之路 2 的角色来自官网的开放接口，需要授权才能读取：点下方按钮，在浏览器里登录 pathofexile.com 并授权（和 Path of Building 2 的导入一样）。POBT 会记住授权，下次不必再登录。",
      signIn: "登录并获取角色",
      share: { label: "WeGame 分享链接", hint: "腾讯服：在 WeGame 流放之路 2 助手里打开角色数据，点右上角「一键分享」，复制链接粘贴到这里", fetch: "获取角色" },
    },
    realms: { pc: "国际服", xbox: "Xbox", sony: "PS", tencent: "腾讯服", poe2: "国际服", wegame: "腾讯服" },
    accountName: "账号名",
    accountHint: "Name#1234",
    sessid: "POESESSID",
    show: "显示",
    hide: "隐藏",
    sessidHint: (r) =>
      r === "tencent"
        ? "必填：登录 poe.game.qq.com 后浏览器中名为 POESESSID 的 Cookie（F12 → 应用 → Cookie）"
        : "可选：角色资料设为私密时需要，pathofexile.com 的 POESESSID Cookie",
    guide: {
      link: "如何获取？",
      title: "获取 POESESSID",
      steps: (r) => [
        `点下方「打开官网」，在 Chrome 或 Edge 浏览器里登录${r === "tencent" ? "腾讯流放之路官网 poe.game.qq.com" : " pathofexile.com "}。`,
        "登录后，在网页上按 F12，打开浏览器的开发者工具。",
        "在开发者工具顶部选「应用」（英文是 Application，没显示时点 » 找）。Firefox 里叫「存储」。",
        "在左侧展开「Cookie」，点下面的网站地址。",
        "在右侧列表里找到名称为 POESESSID 的一行，双击它的「值」，按 Ctrl+C 复制。",
        "回到 POBT，粘贴到 POESESSID 输入框（Ctrl+V），点「获取角色」。",
      ],
      warn: "POESESSID 相当于你的登录凭证，不要发给任何人。在官网退出登录后它会失效，需要重新复制。",
      close: "知道了",
    },
    signIn: "打开官网",
    fetch: "获取角色",
    refresh: "更新",
    updated: (s) => `更新于 ${new Date(s * 1000).toLocaleString()}`,
    saved: "已保存的账号",
    none: "还没有账号",
    remove: "移除",
    all: "全部",
    level: (n) => `等级 ${n}`,
    copyCode: "复制",
    save: { title: "保存到 Path of Building", root: "构筑", name: "构筑名称", hint: "选择一个文件夹新建构筑，或选择一个已有构筑覆盖它", save: "保存", overwrite: "覆盖", replaces: (f) => `将覆盖 ${f}`, cancel: "取消" },
    saveToPob: "保存",
    empty: "账号的角色会显示在这里",
    copied: "已复制 POB 代码",
    savedTo: (n) => `已保存：${n}`,
    untranslated: (n) => `有 ${n} 行词缀未能翻译`,
    steps: {
      account: "查找账号…",
      characters: "获取角色列表…",
      items: "获取装备和天赋…",
      translating: "翻译物品…",
      loading: "加载 Path of Building…",
      importing: "导入角色…",
      saving: "保存构筑…",
      signin: "等待在浏览器中登录授权…",
    },
    errors: {
      needSessid: "腾讯服需要填写 POESESSID",
      needAccount: "请填写账号名",
      private: "角色资料是私密的，或 POESESSID 无效：请在官网公开角色，或填写 POESESSID",
      notFound: "找不到这个账号或角色",
      noCharacters: "这个账号没有角色",
      noPob: "请先在主界面选择或安装流放之路的 Path of Building",
      restart: "已加载另一个游戏的 Path of Building，请重启 POBT 后再导出",
      noPob2: "请先在主界面选择或安装流放之路 2 的 Path of Building",
      signinTimeout: "等待登录超时，请重试",
      signinDenied: "未在官网上授权 POBT",
      signinFailed: "登录失败，请重试",
      signinPort: "无法等待登录：端口 49082 到 49084 已被占用（可能 Path of Building 2 正在登录）",
      needShare: "请粘贴 WeGame 分享链接",
      shareExpired: "WeGame 分享链接无效或已过期，请重新分享角色",
      blocked: "官网的防护（Cloudflare）拦下了 POBT 的请求，某些网络下会这样：请稍后再试，或换个网络",
    },
    rateLimited: (r, wait) =>
      (r === "tencent" ? "请求太频繁：腾讯限制每个账号每分钟 10 次、每 30 分钟 50 次请求" : "请求太频繁：Path of Exile 官网限制了每个账号的请求次数") +
      (wait ? `，请 ${wait} 秒后再试` : "，请稍后再试"),
    login: (r) =>
      r === "tencent" ? "POESESSID 无效或已过期，请重新登录官网后复制" : "官网要求浏览器验证，请稍后再试或填写 POESESSID",
    network: (e) => `网络错误：${e}`,
  },
  "zh-rTW": {
    open: "角色匯入",
    back: "返回",
    title: "角色匯入",
    poe2: {
      title: "流亡黯道 2",
      body: "流亡黯道 2 的角色來自官網的開放介面，需要授權才能讀取：點下方按鈕，在瀏覽器裡登入 pathofexile.com 並授權（和 Path of Building 2 的匯入一樣）。POBT 會記住授權，下次不必再登入。",
      signIn: "登入並取得角色",
      share: { label: "WeGame 分享連結", hint: "騰訊服：在 WeGame 流亡黯道 2 助手裡打開角色資料，點右上角「一鍵分享」，複製連結貼到這裡", fetch: "取得角色" },
    },
    realms: { pc: "國際服", xbox: "Xbox", sony: "PS", tencent: "騰訊服", poe2: "國際服", wegame: "騰訊服" },
    accountName: "帳號名稱",
    accountHint: "Name#1234",
    sessid: "POESESSID",
    show: "顯示",
    hide: "隱藏",
    sessidHint: (r) =>
      r === "tencent"
        ? "必填：登入 poe.game.qq.com 後瀏覽器中名為 POESESSID 的 Cookie（F12 → 應用程式 → Cookie）"
        : "選填：角色資料設為私密時需要，pathofexile.com 的 POESESSID Cookie",
    guide: {
      link: "如何取得？",
      title: "取得 POESESSID",
      steps: (r) => [
        `點下方「打開官網」，在 Chrome 或 Edge 瀏覽器裡登入${r === "tencent" ? "騰訊流放之路官網 poe.game.qq.com" : " pathofexile.com "}。`,
        "登入後，在網頁上按 F12，打開瀏覽器的開發人員工具。",
        "在開發人員工具頂部選「應用程式」（英文是 Application，沒顯示時點 » 找）。Firefox 裡叫「儲存空間」。",
        "在左側展開「Cookie」，點下面的網站位址。",
        "在右側列表裡找到名稱為 POESESSID 的一行，雙擊它的「值」，按 Ctrl+C 複製。",
        "回到 POBT，貼到 POESESSID 輸入框（Ctrl+V），點「取得角色」。",
      ],
      warn: "POESESSID 相當於你的登入憑證，不要給任何人。在官網登出後它會失效，需要重新複製。",
      close: "知道了",
    },
    signIn: "打開官網",
    fetch: "取得角色",
    refresh: "更新",
    updated: (s) => `更新於 ${new Date(s * 1000).toLocaleString()}`,
    saved: "已儲存的帳號",
    none: "還沒有帳號",
    remove: "移除",
    all: "全部",
    level: (n) => `等級 ${n}`,
    copyCode: "複製",
    save: { title: "儲存到 Path of Building", root: "構築", name: "構築名稱", hint: "選擇一個資料夾新建構築，或選擇一個已有構築覆蓋它", save: "儲存", overwrite: "覆蓋", replaces: (f) => `將覆蓋 ${f}`, cancel: "取消" },
    saveToPob: "儲存",
    empty: "帳號的角色會顯示在這裡",
    copied: "已複製 POB 代碼",
    savedTo: (n) => `已儲存：${n}`,
    untranslated: (n) => `有 ${n} 行詞綴未能翻譯`,
    steps: {
      account: "尋找帳號…",
      characters: "取得角色列表…",
      items: "取得裝備和天賦…",
      translating: "翻譯物品…",
      loading: "載入 Path of Building…",
      importing: "匯入角色…",
      saving: "儲存構築…",
      signin: "等待在瀏覽器中登入授權…",
    },
    errors: {
      needSessid: "騰訊服需要填寫 POESESSID",
      needAccount: "請填寫帳號名稱",
      private: "角色資料是私密的，或 POESESSID 無效：請在官網公開角色，或填寫 POESESSID",
      notFound: "找不到這個帳號或角色",
      noCharacters: "這個帳號沒有角色",
      noPob: "請先在主介面選擇或安裝流亡黯道的 Path of Building",
      restart: "已載入另一個遊戲的 Path of Building，請重新啟動 POBT 後再匯出",
      noPob2: "請先在主介面選擇或安裝流亡黯道 2 的 Path of Building",
      signinTimeout: "等待登入逾時，請重試",
      signinDenied: "未在官網上授權 POBT",
      signinFailed: "登入失敗，請重試",
      signinPort: "無法等待登入：連接埠 49082 到 49084 已被佔用（可能 Path of Building 2 正在登入）",
      needShare: "請貼上 WeGame 分享連結",
      shareExpired: "WeGame 分享連結無效或已過期，請重新分享角色",
      blocked: "官網的防護（Cloudflare）攔下了 POBT 的請求，某些網路下會這樣：請稍後再試，或換個網路",
    },
    rateLimited: (r, wait) =>
      (r === "tencent" ? "請求太頻繁：騰訊限制每個帳號每分鐘 10 次、每 30 分鐘 50 次請求" : "請求太頻繁：Path of Exile 官網限制了每個帳號的請求次數") +
      (wait ? `，請 ${wait} 秒後再試` : "，請稍後再試"),
    login: (r) =>
      r === "tencent" ? "POESESSID 無效或已過期，請重新登入官網後複製" : "官網要求瀏覽器驗證，請稍後再試或填寫 POESESSID",
    network: (e) => `網路錯誤：${e}`,
  },
  "ko-KR": {
    open: "캐릭터 가져오기",
    back: "돌아가기",
    title: "캐릭터 가져오기",
    poe2: {
      title: "패스 오브 엑자일 2",
      body: "패스 오브 엑자일 2의 캐릭터는 공식 사이트의 API에서 가져오며, 허용이 필요합니다: 아래 버튼을 눌러 브라우저에서 pathofexile.com에 로그인하고 허용하세요 (Path of Building 2의 가져오기와 같습니다). POBT가 로그인을 기억합니다.",
      signIn: "로그인하고 캐릭터 가져오기",
      share: { label: "WeGame 공유 링크", hint: "텐센트: WeGame 패스 오브 엑자일 2 도우미에서 캐릭터 데이터를 열고 공유(一键分享)를 눌러 링크를 복사하세요", fetch: "캐릭터 가져오기" },
    },
    realms: { pc: "PC", xbox: "Xbox", sony: "PS", tencent: "텐센트", poe2: "PC", wegame: "텐센트" },
    accountName: "계정 이름",
    accountHint: "Name#1234",
    sessid: "POESESSID",
    show: "보기",
    hide: "숨기기",
    sessidHint: (r) =>
      r === "tencent"
        ? "필수: poe.game.qq.com에 로그인한 뒤 브라우저의 POESESSID 쿠키 (F12 → 애플리케이션 → 쿠키)"
        : "선택: 비공개 프로필일 때 pathofexile.com의 POESESSID 쿠키",
    guide: {
      link: "어떻게 얻나요?",
      title: "POESESSID 얻기",
      steps: (r) => [
        `아래 "사이트 열기"를 누르고 Chrome 또는 Edge에서 ${r === "tencent" ? "poe.game.qq.com" : "pathofexile.com"}에 로그인하세요.`,
        "사이트에서 F12를 눌러 개발자 도구를 여세요.",
        "개발자 도구 위쪽에서 애플리케이션(Application)을 고르세요(안 보이면 »). Firefox에서는 저장소입니다.",
        "왼쪽에서 쿠키를 펼치고 그 아래 사이트 주소를 누르세요.",
        "목록에서 이름이 POESESSID인 줄을 찾아 값을 두 번 클릭하고 복사하세요(Ctrl+C).",
        "POBT로 돌아와 POESESSID 칸에 붙여넣고(Ctrl+V) 캐릭터 불러오기를 누르세요.",
      ],
      warn: "POESESSID는 로그인 정보와 같습니다: 아무에게도 주지 마세요. 사이트에서 로그아웃하면 바뀌니 다시 복사하세요.",
      close: "알겠습니다",
    },
    signIn: "사이트 열기",
    fetch: "캐릭터 불러오기",
    refresh: "새로 고침",
    updated: (s) => `${new Date(s * 1000).toLocaleString()} 업데이트`,
    saved: "저장된 계정",
    none: "아직 계정이 없습니다",
    remove: "삭제",
    all: "전체",
    level: (n) => `레벨 ${n}`,
    copyCode: "복사",
    save: { title: "Path of Building에 저장", root: "빌드", name: "빌드 이름", hint: "새 빌드를 만들 폴더나 덮어쓸 빌드를 고르세요", save: "저장", overwrite: "덮어쓰기", replaces: (f) => `${f}을(를) 덮어씁니다`, cancel: "취소" },
    saveToPob: "저장",
    empty: "계정의 캐릭터가 여기에 표시됩니다",
    copied: "빌드 코드를 복사했습니다",
    savedTo: (n) => `저장했습니다: ${n}`,
    untranslated: (n) => `옵션 ${n}줄을 번역하지 못했습니다`,
    steps: {
      account: "계정 찾는 중…",
      characters: "캐릭터 불러오는 중…",
      items: "장비와 패시브 불러오는 중…",
      translating: "아이템 번역 중…",
      loading: "Path of Building 불러오는 중…",
      importing: "가져오는 중…",
      saving: "저장 중…",
      signin: "브라우저에서 로그인을 기다리는 중…",
    },
    errors: {
      needSessid: "텐센트 서버는 POESESSID가 필요합니다",
      needAccount: "계정 이름을 입력하세요",
      private: "프로필이 비공개이거나 POESESSID가 잘못되었습니다: 캐릭터를 공개하거나 POESESSID를 입력하세요",
      notFound: "계정이나 캐릭터를 찾을 수 없습니다",
      noCharacters: "계정에 캐릭터가 없습니다",
      noPob: "먼저 패스 오브 엑자일의 Path of Building을 선택하거나 설치하세요",
      restart: "다른 게임의 Path of Building이 로드되었습니다: POBT를 다시 시작한 뒤 내보내세요",
      noPob2: "먼저 패스 오브 엑자일 2용 Path of Building을 선택하거나 설치하세요",
      signinTimeout: "로그인 시간이 지났습니다: 다시 시도하세요",
      signinDenied: "사이트에서 POBT를 허용하지 않았습니다",
      signinFailed: "로그인에 실패했습니다: 다시 시도하세요",
      signinPort: "로그인을 기다릴 수 없습니다: 49082~49084 포트가 사용 중입니다 (Path of Building 2가 로그인 중일 수 있습니다)",
      needShare: "WeGame 공유 링크를 붙여 넣으세요",
      shareExpired: "WeGame 공유 링크가 잘못되었거나 만료되었습니다: 캐릭터를 다시 공유하세요",
      blocked: "공식 사이트의 보호(Cloudflare)가 POBT의 요청을 막았습니다 (일부 네트워크에서 그렇습니다): 나중에 다시 시도하거나 다른 네트워크를 사용하세요",
    },
    rateLimited: (r, wait) =>
      (r === "tencent" ? "요청이 너무 많습니다: 텐센트는 계정당 1분에 10회, 30분에 50회로 제한합니다" : "요청이 너무 많습니다: Path of Exile 사이트가 계정의 요청 횟수를 제한합니다") +
      (wait ? `. ${wait}초 후 다시 시도하세요` : ". 잠시 후 다시 시도하세요"),
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

/** How an account is shown: its name, or (Tencent's, known by it) the end of its POESESSID. */
export function accountLabel(a: Account): string {
  return a.name || `POESESSID …${a.sessid.slice(-4)}`;
}

/** The same account: its realm and name, or its POESESSID when it has no name. */
export function sameAccount(a: Account, b: Account): boolean {
  return a.realm === b.realm && a.name === b.name && (a.name !== "" || a.sessid === b.sessid);
}

/** The words for a job's error code (`account.rs`'s), or the error itself. */
export function errorText(s: AccountStrings, realm: Realm, error: string): string {
  if (error === "login") return s.login(realm);
  if (error.startsWith("rateLimited")) return s.rateLimited(realm, error.split(":")[1] ?? "");
  if (error.startsWith("network: ")) return s.network(error.slice("network: ".length));
  if (error === "noPob" && realm === "poe2") return s.errors.noPob2;
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
