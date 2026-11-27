import { Clipboard, Image, Scroll, Shader, signal, Text, View, type ViewStyle } from "nsh";
import { currentWindow } from "nsh/desktop";
import { checkForUpdate, downloadUpdate, installAndRestart, installOnQuit, shellInfo, type AppUpdate } from "nsh/updater";
import { Input, Menu, MenuItem, MenuSeparator } from "nsh/base";
import { Pob, PobCanvas } from "pobt/native";
import title from "../assets/ui/title.png";
import { GATE } from "./gate";
import { BODY, BrassButton as Button, C, DISPLAY, ENGRAVED, Gate, GoldCheckbox, GoldRule as Rule, Plaque, PressButton, PrimaryButton, textIn } from "./ui/launcher";
import { BuildEditor, editorBack, editorBackLabel } from "./editor/BuildEditor";
import { Icon } from "nsh-icon";
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "nsh-icon-lucide";
import { t as editorT, useLanguage } from "./editor/i18n";
import {
  accountLabel,
  accountStrings,
  errorText,
  PC_SITE,
  POE2_REALMS,
  REALMS,
  sameAccount,
  TENCENT_SITE,
  watchJob,
  type Account,
  type AccountProgress,
  type AccountStrings,
  type Character,
  type Realm,
} from "./accounts";
import { AGENT_SITES, aiErrorText, analysisStrings, reportText, whenText, type Agent, type AiProgress, type BuildEntry, type BuildRoot } from "./analysis";
import { filterStrings, makeFilter, MIN_WORTH, STRICTNESS, type FilterResult, type Strictness } from "./lootfilter";
import { AnalysisFailed, AnalysisReport, AnalysisRunning, PANEL, SmallButton, watchAnalysis } from "./AnalysisView";
// The icon at the size the launcher shows it (icon.png is the app's, 1024 square).
import icon from "../assets/ui/icon-64.png";
type Game = "Poe1" | "Poe2";

interface Settings {
  poe1_dir: string | null;
  poe2_dir: string | null;
  game: Game;
  language: string | null;
  /** Start the classic Path of Building instead of POBT's build editor. */
  legacy?: boolean;
}

const REPO = "https://github.com/huacnlee/pobt";
const SITE = "https://huacnlee.github.io/pobt/";

const GAMES: { id: Game; key: string }[] = [
  { id: "Poe1", key: "poe1" },
  { id: "Poe2", key: "poe2" },
];

const LINKS: { label: string; url: string }[] = [
  { label: "POE Ninja", url: "https://poe.ninja" },
  { label: "POB", url: "https://github.com/PathOfBuildingCommunity/PathOfBuilding" },
  { label: "POB2", url: "https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2" },
];

// The languages, in the order the launcher lists them; `null` is English, untranslated.
const LANGUAGES: { value: string | null; name: string }[] = [
  { value: null, name: "English" },
  { value: "zh-rCN", name: "简体中文" },
  { value: "zh-rTW", name: "繁體中文" },
  { value: "ko-KR", name: "한국어" },
];

interface Strings {
  games: Record<Game, string>;
  subtitle: string;
  pobFolder: string;
  notFound: string;
  pick: string;
  install: string;
  openFolder: string;
  configure: string;
  reset: string;
  installing: (done: number, total: number) => string;
  unpacking: (percent: number) => string;
  installFailed: string;
  start: string;
  back: string;
  loading: string;
  needDir: string;
  notPobDir: (dir: string, game: string) => string;
  downloading: (version: string, percent: number) => string;
  ready: (version: string) => string;
  released: (version: string) => string;
  failed: (error: string) => string;
  restart: string;
  check: string;
  checking: string;
  upToDate: string;
  manual: string;
  download: string;
  tools: string;
}

// The launcher in each language it translates POB to.
const UI: Record<string, Strings> = {
  en: {
    games: { Poe1: "Path of Exile", Poe2: "Path of Exile 2" },
    subtitle: "Your Path of Building, in your language",
    pobFolder: "PATH OF BUILDING",
    notFound: "Path of Building not found: choose its folder",
    pick: "Choose folder…",
    install: "Install",
    openFolder: "Open folder",
    configure: "Configure",
    reset: "Reset",
    installing: (d, t) => `Downloading ${d} / ${t} MB`,
    unpacking: (p) => `Unpacking ${p}%`,
    installFailed: "Install failed",
    start: "Start",
    back: "Launcher",
    loading: "Loading Path of Building…",
    needDir: "Choose the folder of Path of Building first",
    notPobDir: (dir, game) => `${dir} is not a Path of Building folder for ${game}`,
    downloading: (v, p) => `Downloading v${v} · ${p}%`,
    ready: (v) => `New v${v}`,
    released: (v) => `New v${v}`,
    failed: () => "Update failed",
    restart: "Update",
    check: "Check for updates",
    checking: "Checking…",
    upToDate: "Up to date",
    manual: "Download it",
    download: "Download",
    tools: "Tools",
  },
  "zh-rCN": {
    games: { Poe1: "流放之路", Poe2: "流放之路 2" },
    subtitle: "POB 构筑的多语言翻译",
    pobFolder: "PATH OF BUILDING",
    notFound: "未找到 Path of Building，请选择它的安装目录",
    pick: "选择目录…",
    install: "安装",
    openFolder: "打开目录",
    configure: "配置",
    reset: "重置",
    installing: (d, t) => `下载中 ${d} / ${t} MB`,
    unpacking: (p) => `解压中 ${p}%`,
    installFailed: "安装失败",
    start: "启动",
    back: "返回主界面",
    loading: "正在加载 Path of Building…",
    needDir: "请先选择 Path of Building 的安装目录",
    notPobDir: (dir, game) => `${dir} 不是${game}的 Path of Building 目录`,
    downloading: (v, p) => `下载中 v${v} · ${p}%`,
    ready: (v) => `新版本 v${v}`,
    released: (v) => `新版本 v${v}`,
    failed: () => "更新失败",
    restart: "更新",
    check: "检查更新",
    checking: "检查中…",
    upToDate: "已是最新版本",
    manual: "手动下载",
    download: "下载",
    tools: "工具",
  },
  "zh-rTW": {
    games: { Poe1: "流亡黯道", Poe2: "流亡黯道 2" },
    subtitle: "POB 構築的多語言翻譯",
    pobFolder: "PATH OF BUILDING",
    notFound: "找不到 Path of Building，請選擇它的安裝目錄",
    pick: "選擇目錄…",
    install: "安裝",
    openFolder: "打開目錄",
    configure: "配置",
    reset: "重置",
    installing: (d, t) => `下載中 ${d} / ${t} MB`,
    unpacking: (p) => `解壓中 ${p}%`,
    installFailed: "安裝失敗",
    start: "啟動",
    back: "返回主介面",
    loading: "正在載入 Path of Building…",
    needDir: "請先選擇 Path of Building 的安裝目錄",
    notPobDir: (dir, game) => `${dir} 不是${game}的 Path of Building 目錄`,
    downloading: (v, p) => `下載中 v${v} · ${p}%`,
    ready: (v) => `新版本 v${v}`,
    released: (v) => `新版本 v${v}`,
    failed: () => "更新失敗",
    restart: "更新",
    check: "檢查更新",
    checking: "檢查中…",
    upToDate: "已是最新版本",
    manual: "手動下載",
    download: "下載",
    tools: "工具",
  },
  "ko-KR": {
    games: { Poe1: "패스 오브 엑자일", Poe2: "패스 오브 엑자일 2" },
    subtitle: "Path of Building을 당신의 언어로",
    pobFolder: "PATH OF BUILDING",
    notFound: "Path of Building을 찾을 수 없습니다. 폴더를 선택하세요",
    pick: "폴더 선택…",
    install: "설치",
    openFolder: "폴더 열기",
    configure: "설정",
    reset: "초기화",
    installing: (d, t) => `다운로드 중 ${d} / ${t} MB`,
    unpacking: (p) => `압축 해제 중 ${p}%`,
    installFailed: "설치 실패",
    start: "시작",
    back: "처음 화면",
    loading: "Path of Building 불러오는 중…",
    needDir: "먼저 Path of Building 폴더를 선택하세요",
    notPobDir: (dir, game) => `${dir}은(는) ${game}의 Path of Building 폴더가 아닙니다`,
    downloading: (v, p) => `다운로드 중 v${v} · ${p}%`,
    ready: (v) => `새 버전 v${v}`,
    released: (v) => `새 버전 v${v}`,
    failed: () => "업데이트 실패",
    restart: "업데이트",
    check: "업데이트 확인",
    checking: "확인 중…",
    upToDate: "최신 버전입니다",
    manual: "직접 다운로드",
    download: "다운로드",
    tools: "도구",
  },
};

/** The go-pob build editor's name in the Tools menu, in the launcher's language. */
const editorLabel = () => (void useLanguageOnce(), editorT("goPob"));
const legacyLabel = () => (void useLanguageOnce(), editorT("legacy"));
const launcherLabel = () => (void useLanguageOnce(), editorT("launcher"));
let languageSet: string | null | undefined;
/** Puts the build editor in the launcher's language (its dictionary loads off the UI thread). */
function useLanguageOnce() {
  const lang = currentLanguage();
  if (languageSet !== lang) {
    languageSet = lang;
    void useLanguage(lang);
  }
}

/** The language the launcher last saved: for what has no settings of its own to hand. */
function currentLanguage(): string | null {
  return (JSON.parse(Pob.settings()) as Settings).language;
}

function strings(language: string | null): Strings {
  return UI[language ?? "en"] ?? UI.en;
}

// Path of Exile 2's look: near-black stone, low saturation, white text, a dark red accent.
function dirOf(s: Settings, game: Game): string | null {
  return game === "Poe1" ? s.poe1_dir : s.poe2_dir;
}

/** A footer link, set in the display face as the game's menus are. */
function Link(props: { label: string; url: string }) {
  // Lights up under the pointer.
  const hover = signal(false);
  return (
    <View
      role="link"
      onPress={() => Pob.openUrl(props.url)}
      onMouseEnter={() => hover.set(true)}
      onMouseLeave={() => hover.set(false)}
      style={{ paddingVertical: 4 }}
    >
      <Text
        style={{
          fontFamily: DISPLAY,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 2,
          color: hover() ? "#fff3d0" : C.gold,
          textShadow: hover() ? "0 0 10px rgba(240,220,170,0.8)" : "none",
        }}
      >
        {props.label.toUpperCase()}
      </Text>
    </View>
  );
}

function Dot() {
  return <View style={{ width: 5, height: 5, backgroundColor: C.trimHi, transform: [{ rotate: "45deg" }] }} />;
}

// POBT's own updates, one state for the whole app: checked at start, and again when the user asks. A newer version
// downloads on its own and replaces the app when it quits; the badge offers to restart into it now.
const update = signal<AppUpdate | null>(null);
const updateState = signal<"idle" | "checking" | "latest" | "downloading" | "ready" | "failed">("idle");
const updateProgress = signal(0);
let latestTimer: ReturnType<typeof setTimeout> | undefined;

function checkUpdates() {
  const s = updateState();
  if (s === "checking" || s === "downloading" || s === "ready") return;
  clearTimeout(latestTimer);
  updateState.set("checking");
  checkForUpdate()
    .then(async (u) => {
      update.set(u);
      if (!u) {
        // Up to date: said for a moment, then the button again.
        updateState.set("latest");
        latestTimer = setTimeout(() => updateState() === "latest" && updateState.set("idle"), 3000);
        return;
      }
      if (!u.canInstall) {
        updateState.set("idle");
        return;
      }
      updateState.set("downloading");
      await downloadUpdate(({ received, total }) => updateProgress.set(total ? received / total : 0));
      await installOnQuit();
      updateState.set("ready");
    })
    .catch((e) => {
      console.error("updating POBT:", e);
      updateState.set("failed");
    });
}

/** The update in the title bar: a newer version as it downloads and once ready (press to restart into it), and
 * otherwise Check for updates, which says so when POBT is up to date. Not in a development run, which has no
 * version to update. */
function UpdateBadge(props: { t: () => Strings }) {
  const hover = signal(false);
  const text = () => {
    const t = props.t();
    const u = update();
    switch (updateState()) {
      case "checking":
        return t.checking;
      case "latest":
        return t.upToDate;
      case "failed":
        return t.failed("");
      case "downloading":
        return u ? t.downloading(u.version, Math.round(updateProgress() * 100)) : t.checking;
      case "ready":
        return u ? t.ready(u.version) : "";
      default:
        return u ? t.released(u.version) : t.check;
    }
  };
  const press = () => {
    const u = update();
    if (updateState() === "ready") installAndRestart().catch(() => updateState.set("failed"));
    // It failed: the release page, to download it by hand.
    else if (updateState() === "failed") Pob.openUrl(`${REPO}/releases/latest`);
    else if (u && !u.canInstall) Pob.openUrl(u.url);
    else checkUpdates();
  };
  // A newer version stands out in a framed badge; the button is a plain link, as the footer's.
  const found = () => (update() !== null && updateState() !== "latest") || updateState() === "failed";
  return (
    <If when={shellInfo().version}>
      <View
        role="button"
        onPress={press}
        onMouseEnter={() => hover.set(true)}
        onMouseLeave={() => hover.set(false)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: found() ? 10 : 4,
          paddingVertical: 3,
          borderWidth: found() ? 1 : 0,
          borderColor: hover() ? C.trimHi : C.trim,
          backgroundColor: found() ? "rgba(0,0,0,0.6)" : "transparent",
        }}
      >
        <If when={found()}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.unique }} />
        </If>
        <Text style={{ fontFamily: BODY, fontSize: 12, color: found() ? C.text : hover() ? "#fff3d0" : C.gold }}>{text()}</Text>
        <If when={updateState() === "ready"}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.unique }}>{props.t().restart}</Text>
            <Icon icon={ChevronRight} size={12} class={textIn(C.unique)} />
          </View>
        </If>
        <If when={updateState() === "failed"}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.unique }}>{props.t().manual}</Text>
            <Icon icon={ChevronRight} size={12} class={textIn(C.unique)} />
          </View>
        </If>
      </View>
    </If>
  );
}

// An install of Path of Building, as `Pob.installProgress` reports it.
interface InstallProgress {
  game: Game;
  phase: "downloading" | "unpacking" | "done" | "failed";
  done: number;
  total: number;
  message: string;
}

function CardMenuItem(props: { label: string; color?: string; onSelect: () => void }) {
  const active = { backgroundColor: "rgba(177,141,78,0.18)" };
  return (
    <MenuItem onSelect={props.onSelect} style={{ paddingHorizontal: 12, paddingVertical: 6 }} hoverStyle={active} focusStyle={active}>
      <Text style={{ fontFamily: BODY, fontSize: 13, color: props.color ?? C.text }}>{props.label}</Text>
    </MenuItem>
  );
}

function GameCard(props: {
  game: Game;
  settings: () => Settings;
  t: () => Strings;
  installing: () => InstallProgress | null;
  onSelect: () => void;
  onPick: () => void;
  onInstall: () => void;
  onReset: () => void;
}) {
  const selected = () => props.settings().game === props.game;
  const dir = () => dirOf(props.settings(), props.game);
  // This game's install while it runs, or failed.
  const install = () => {
    const p = props.installing();
    return p && p.game === props.game && p.phase !== "done" ? p : null;
  };
  const status = (p: InstallProgress) => {
    const t = props.t();
    if (p.phase === "failed") return `${t.installFailed}: ${p.message}`;
    if (p.phase === "unpacking") return t.unpacking(p.total ? Math.floor((p.done / p.total) * 100) : 0);
    const mb = (n: number) => Math.round(n / 1048576);
    return t.installing(mb(p.done), mb(p.total));
  };
  const busy = () => install()?.phase === "downloading" || install()?.phase === "unpacking";
  const menuOpen = signal(false);
  const hasMenu = () => !install() && !!dir();
  // The version of the folder's Path of Building, read again when the folder changes.
  const version = () => (dir() ? Pob.pobVersion(dir()!) : "");
  return (
    <View onPress={props.onSelect} style={{ flex: 1, paddingTop: 22 }}>
      {/* The panel, framed by a double trim line */}
      <View
        style={{
          borderWidth: 1,
          borderColor: selected() ? C.trimHi : C.trim,
          backgroundColor: C.panel,
          boxShadow: selected()
            ? "inset 0 0 0 3px rgba(0,0,0,0.7), inset 0 0 0 4px rgba(177,141,78,0.45), 0 0 36px rgba(140,170,220,0.18)"
            : "inset 0 0 0 3px rgba(0,0,0,0.7), inset 0 0 0 4px rgba(107,82,44,0.35), 0 12px 30px rgba(0,0,0,0.7)",
          // A fixed height, so changing the language moves nothing.
          height: 200,
          justifyContent: "center",
          paddingTop: 30,
          paddingBottom: 22,
          paddingHorizontal: 24,
          gap: 12,
          alignItems: "center",
        }}
        hoverStyle={selected() ? undefined : { borderColor: C.trimHi }}
      >
        <If when={props.t().games[props.game] !== UI.en.games[props.game]}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: 3, color: selected() ? C.gold : C.dim }}>
          {UI.en.games[props.game].toUpperCase()}
        </Text>
        </If>
        <Rule width={260} dim={!selected()} />
        <If
          when={hasMenu()}
          else={
            <>
              <Text
                style={{
                  fontFamily: BODY,
                  fontSize: 12,
                  color: install() ? (install()!.phase === "failed" ? C.red : C.gold) : C.red,
                  textAlign: "center",
                  numberOfLines: 2,
                }}
              >
                {install() ? status(install()!) : props.t().notFound}
              </Text>
              {/* No Path of Building yet: install it from its release, or choose where it is */}
              <View style={{ flexDirection: "row", gap: 12, opacity: busy() ? 0.5 : 1 }}>
                <If when={!dir()}>
                  <Button label={props.t().install} onPress={() => !busy() && props.onInstall()} />
                </If>
                <Button label={props.t().pick} onPress={() => !busy() && props.onPick()} />
              </View>
            </>
          }
        >
          {/* Installed: where it is, and a Configure button for the folder's menu */}
          <>
            <Text style={{ alignSelf: "stretch", fontFamily: BODY, fontSize: 12, color: C.muted, textAlign: "center", numberOfLines: 1, textOverflow: "ellipsis-middle" }}>
              {dir()}
            </Text>
            <Menu
              offset={4}
              align="center"
              open={menuOpen()}
              onOpenChange={(e) => menuOpen.set(e.open)}
              popupStyle={{
                minWidth: 150,
                padding: 4,
                backgroundColor: C.panel,
                borderWidth: 1,
                borderColor: C.trim,
                boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
              }}
              trigger={<Button label={props.t().configure} onPress={() => menuOpen.set(true)} />}
            >
              <CardMenuItem label={props.t().openFolder} onSelect={() => Pob.openDir(dir()!)} />
              <CardMenuItem label={props.t().pick} onSelect={props.onPick} />
              <MenuSeparator style={{ height: 1, marginVertical: 4, backgroundColor: C.trim }} />
              <CardMenuItem label={props.t().reset} color={C.red} onSelect={props.onReset} />
            </Menu>
          </>
        </If>
        {/* Its version, in the top right corner */}
        <If when={hasMenu() && version()}>
          <Text style={{ position: "absolute", top: 10, right: 14, fontFamily: DISPLAY, fontSize: 12, color: selected() ? C.gold : C.dim }}>
            v{version()}
          </Text>
        </If>
      </View>
      {/* Its title plaque, set over the top edge; the row around it lets the pointer through to the panel's corners */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", pointerEvents: "box-none" }}>
        <View style={{ width: 300 }}>
          <Plaque kind={() => (selected() ? "red" : "dark")} height={46}>
            <Text style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: "700", color: selected() ? "#f6e6c2" : C.goldHi }}>
              {props.t().games[props.game]}
            </Text>
          </Plaque>
        </View>
      </View>
    </View>
  );
}

const TITLE_BAR = 44;

/** The window's title bar, drawn by the app: POBT at the left (a link to the site); the system draws the window's
 * buttons in the reserved title bar area. Dragging it moves the window. Over the launcher's backdrop it is clear, with the version
 * and the update check; over Path of Building, `solid`, with only a way back to the launcher (`onBack`). */
function TitleBar(props: {
  t: () => Strings;
  solid?: boolean;
  onBack?: () => void;
  backLabel?: string;
  onCharacters?: () => void;
  onAnalysis?: () => void;
  onFilter?: () => void;
  onEditor?: () => void;
  /** The build editor's: the way to the classic (Lua) Path of Building's launcher. */
  onLegacy?: () => void;
  /** The label of `onLegacy`'s menu item. */
  legacyText?: string;
}) {
  const brandHover = signal(false);
  const backHover = signal(false);
  const toolsHover = signal(false);
  const toolsOpen = signal(false);
  const win = currentWindow();
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        height: TITLE_BAR,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: win.titleBar().left + 20,
        paddingRight: win.titleBar().right + 12,
        backgroundColor: props.solid ? "#07080a" : "transparent",
        borderBottomWidth: props.solid ? 1 : 0,
        borderColor: "rgba(177,141,78,0.18)",
      }}
    >
      <View
        role="link"
        onPress={() => Pob.openUrl(SITE)}
        onMouseEnter={() => brandHover.set(true)}
        onMouseLeave={() => brandHover.set(false)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Image src={icon} style={{ width: 24, height: 24, filter: brandHover() ? "brightness(1.25)" : "none" }} />
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 4,
            color: brandHover() ? "#fff3d0" : C.gold,
            textShadow: brandHover() ? "0 0 10px rgba(240,220,170,0.8)" : "0 1px 2px #000",
          }}
        >
          POBT
        </Text>
      </View>
      <If when={props.onBack}>
        {(back) => (
          <View
            role="button"
            onPress={() => back()()}
            onMouseEnter={() => backHover.set(true)}
            onMouseLeave={() => backHover.set(false)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 18, paddingVertical: 4 }}
          >
            <Icon icon={ChevronLeft} size={12} strokeWidth={3} class={textIn(backHover() ? "#fff3d0" : C.trimHi)} />
            <Text
              style={{
                fontFamily: DISPLAY,
                fontSize: 12,
                fontWeight: "600",
                letterSpacing: 2,
                color: backHover() ? "#fff3d0" : C.gold,
                textShadow: backHover() ? "0 0 10px rgba(240,220,170,0.8)" : "none",
              }}
            >
              {(props.backLabel ?? props.t().back).toUpperCase()}
            </Text>
          </View>
        )}
      </If>
      {/* Tools, wherever the app is: characters from an account, made builds; a build analysed by an AI */}
      <If when={props.onCharacters}>
        {(open) => (
          <Menu
            offset={6}
            align="start"
            open={toolsOpen()}
            onOpenChange={(e) => toolsOpen.set(e.open)}
            popupStyle={{ minWidth: 150, padding: 4, backgroundColor: C.panel, borderWidth: 1, borderColor: C.trim, boxShadow: "0 8px 24px rgba(0,0,0,0.7)" }}
            trigger={
              <View
                role="button"
                onPress={() => toolsOpen.set(true)}
                onMouseEnter={() => toolsHover.set(true)}
                onMouseLeave={() => toolsHover.set(false)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginLeft: 18, paddingVertical: 4 }}
              >
                <Text
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 12,
                    fontWeight: "600",
                    letterSpacing: 2,
                    color: toolsHover() || toolsOpen() ? "#fff3d0" : C.gold,
                    textShadow: toolsHover() ? "0 0 10px rgba(240,220,170,0.8)" : "none",
                  }}
                >
                  {props.t().tools.toUpperCase()}
                </Text>
                <Icon icon={ChevronDown} size={10} class={textIn(toolsHover() ? "#fff3d0" : C.trimHi)} />
              </View>
            }
          >
            <CardMenuItem label={accountStrings(currentLanguage()).open} onSelect={() => open()()} />
            <If when={props.onAnalysis}>{(analyse) => <CardMenuItem label={analysisStrings(currentLanguage()).open} onSelect={() => analyse()()} />}</If>
            <If when={props.onFilter}>{(filter) => <CardMenuItem label={filterStrings(currentLanguage()).open} onSelect={() => filter()()} />}</If>
            <If when={props.onEditor}>
              {(editor) => (
                <>
                  <MenuSeparator />
                  <CardMenuItem label={editorLabel()} onSelect={() => editor()()} />
                </>
              )}
            </If>
            <If when={props.onLegacy}>
              {(legacy) => (
                <>
                  <MenuSeparator />
                  <CardMenuItem label={props.legacyText ?? legacyLabel()} onSelect={() => legacy()()} />
                </>
              )}
            </If>
          </Menu>
        )}
      </If>
      <View style={{ flex: 1 }} />
      {/* The update and the packaged version, on the launcher only; a development run has no version to show. */}
      <If when={!props.solid}>
        <UpdateBadge t={props.t} />
        <If when={shellInfo().version}>
          {(v) => <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>v{v()}</Text>}
        </If>
      </If>
    </View>
  );
}

function Launcher(props: { onStart: () => void; onCharacters: () => void; onAnalysis: () => void; onFilter: () => void; onEditor: () => void }) {
  const settings = signal<Settings>(JSON.parse(Pob.settings()));
  const available = new Set<string>(JSON.parse(Pob.languages()).map((l: { value: string }) => l.value));
  const languages = LANGUAGES.filter((l) => l.value === null || available.has(l.value));
  const t = () => strings(settings().language);

  const update = (change: Partial<Settings>) => settings.set({ ...settings(), ...change });

  const pick = async (game: (typeof GAMES)[number]) => {
    const dir = await Pob.pickDir();
    if (!dir) return;
    if (!Pob.isPobDir(dir, game.key)) {
      say(t().notPobDir(dir, t().games[game.id]), true);
      return;
    }
    update(game.id === "Poe1" ? { poe1_dir: dir, game: game.id } : { poe2_dir: dir, game: game.id });
  };

  // Forgets the game's folder: the card is as on a first run, until one is chosen or found again.
  const reset = (game: (typeof GAMES)[number]) => {
    update(game.id === "Poe1" ? { poe1_dir: null } : { poe2_dir: null });
    Pob.saveSettings(JSON.stringify(settings()));
  };

  // Installing Path of Building: its progress, polled while it runs; done, its folder is the game's.
  const installing = signal<InstallProgress | null>(null);
  const watchInstall = () => {
    const json = Pob.installProgress();
    const p: InstallProgress | null = json ? JSON.parse(json) : null;
    installing.set(p);
    if (p?.phase === "done") {
      update(p.game === "Poe1" ? { poe1_dir: p.message, game: p.game } : { poe2_dir: p.message, game: p.game });
    } else if (p && p.phase !== "failed") {
      setTimeout(watchInstall, 250);
    }
  };
  const install = (game: (typeof GAMES)[number]) => {
    Pob.install(game.key);
    update({ game: game.id });
    watchInstall();
  };
  watchInstall();

  const start = () => {
    const s = settings();
    const dir = dirOf(s, s.game);
    if (!dir) {
      say(t().needDir, true);
      return;
    }
    Pob.saveSettings(JSON.stringify(s));
    // POBT's build editor, unless the classic Path of Building is chosen.
    if (!s.legacy) {
      props.onEditor();
      return;
    }
    const err = Pob.start(dir, s.language ?? "");
    if (err) {
      say(err, true);
      return;
    }
    props.onStart();
  };


  const chooseLanguage = (value: string | null) => {
    update({ language: value });
    Pob.saveSettings(JSON.stringify(settings()));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Gate />

      <TitleBar t={t} onCharacters={props.onCharacters} onAnalysis={props.onAnalysis} onFilter={props.onFilter} onEditor={props.onEditor} />

      <View style={{ flex: 1, paddingHorizontal: 72, paddingBottom: 16, gap: 24, justifyContent: "center" }}>
        {/* Title */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Image src={title} style={{ width: 760, height: 104.5 }} accessibilityLabel="Path of Building" />
          <Rule width={560} />
          <View style={{ paddingHorizontal: 64, paddingVertical: 10, backgroundImage: "radial-gradient(ellipse closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.12) 75%, rgba(0,0,0,0))" }}>
            <Text style={{ fontFamily: BODY, fontSize: 14, color: C.text, textShadow: "0 0 3px #000, 0 0 8px #000, 0 0 14px #000, 0 1px 2px #000" }}>{t().subtitle}</Text>
          </View>
        </View>

        {/* Games */}
        <View style={{ flexDirection: "row", gap: 28 }}>
          <Each of={GAMES}>
            {(g) => (
              <GameCard
                game={g().id}
                settings={settings}
                t={t}
                installing={installing}
                onSelect={() => update({ game: g().id })}
                onPick={() => pick(g())}
                onInstall={() => install(g())}
                onReset={() => reset(g())}
              />
            )}
          </Each>
        </View>

        {/* Language */}
        <View style={{ flexDirection: "row", alignSelf: "center", gap: 6 }}>
          <Each of={languages}>
            {(l) => {
              const selected = () => settings().language === l().value;
              return (
                <PressButton onPress={() => chooseLanguage(l().value)} style={{ width: 132 }}>
                  {(down) => (
                    <Plaque kind={() => (selected() ? "brass" : "dark")} height={40} pressed={down}>
                    <Text style={{ fontFamily: BODY, fontSize: 14, fontWeight: selected() ? "700" : "400", color: selected() ? C.ink : C.gold, textShadow: selected() ? ENGRAVED : "0 1px 2px #000" }}>
                      {l().name}
                    </Text>
                    </Plaque>
                  )}
                </PressButton>
              );
            }}
          </Each>
        </View>

        {/* Start: POBT's build editor, or the classic Path of Building */}
        <View style={{ alignItems: "center", gap: 10 }}>
          <GoldCheckbox
            checked={!!settings().legacy}
            onChange={(on) => {
              update({ legacy: on });
              Pob.saveSettings(JSON.stringify(settings()));
            }}
            label={legacyLabel()}
          />
          <PrimaryButton label={t().start} onPress={start} />
        </View>
      </View>

      {/* Footer */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 32, paddingVertical: 14 }}>
        <Link label={LINKS[0].label} url={LINKS[0].url} />
        <Dot />
        <Link label={LINKS[1].label} url={LINKS[1].url} />
        <Dot />
        <Link label={LINKS[2].label} url={LINKS[2].url} />
        <View style={{ flex: 1 }} />
        <Link label="POBT" url={SITE} />
        <Dot />
        <Link label="GitHub" url={REPO} />
      </View>
    </View>
  );
}

// What the app has to say, as a toast in the bottom right corner of every screen for a while (an error in red, for
// longer): `say` shows one. It slides in and fades in, and fades out before it goes.
const toast = signal<{ text: string; error: boolean } | null>(null);
const toastShown = signal(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastGone: ReturnType<typeof setTimeout> | undefined;
function say(text: string, error = false) {
  clearTimeout(toastTimer);
  clearTimeout(toastGone);
  toast.set({ text, error });
  // Shown a frame after it is there, so it moves in from where it was hidden.
  setTimeout(() => toastShown.set(true), 16);
  toastTimer = setTimeout(hideToast, error ? 6000 : 3500);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastShown.set(false);
  toastGone = setTimeout(() => toast.set(null), 260);
}

/** The toast: in the bottom right corner; a press closes it. */
function Toast() {
  return (
    <If when={toast()}>
      {(t) => (
        <View
          role="alert"
          onPress={hideToast}
          style={{
            position: "absolute",
            right: 24,
            bottom: 24,
            maxWidth: 460,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: "rgba(10,8,6,0.95)",
            borderWidth: 1,
            borderColor: t().error ? C.red : C.trimHi,
            boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
            opacity: toastShown() ? 1 : 0,
            transform: [{ translateX: toastShown() ? 0 : 40 }],
            transitionProperty: "opacity, transform",
            transitionDuration: 240,
            transitionTimingFunction: "ease-out",
          }}
        >
          {/* A check when it went well, a cross when it did not */}
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t().error ? C.red : C.goldHi,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon icon={t().error ? X : Check} size={12} strokeWidth={3} class={textIn(t().error ? C.red : C.goldHi)} />
          </View>
          <Text style={{ flexShrink: 1, fontFamily: BODY, fontSize: 13, color: C.text }}>{t().text}</Text>
        </View>
      )}
    </If>
  );
}

/** A link in the text, as a help: underlined, lit under the pointer. */
function TextLink(props: { label: string; onPress: () => void; size?: number }) {
  const hover = signal(false);
  return (
    <View role="link" onPress={props.onPress} onMouseEnter={() => hover.set(true)} onMouseLeave={() => hover.set(false)}>
      <Text style={{ fontFamily: BODY, fontSize: props.size ?? 12, color: hover() ? "#fff3d0" : C.unique, textDecorationLine: "underline" }}>
        {props.label}
      </Text>
    </View>
  );
}

// The sites a guide's step names, and their addresses: a link where it names one.
const SITES: [string, string][] = [
  ["poe.game.qq.com", TENCENT_SITE],
  ["pathofexile.com", PC_SITE],
];

/** A step of the POESESSID guide: its text, the site it names a link to it. */
function GuideStep(props: { text: string }) {
  const style = { fontFamily: BODY, fontSize: 14, color: C.text, lineHeight: 22 };
  const site = () => SITES.find(([domain]) => props.text.includes(domain));
  return (
    <If when={site()} else={<Text style={{ ...style, flex: 1 }}>{props.text}</Text>}>
      {(found) => {
        const [before, after] = props.text.split(found()[0]);
        return (
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
            <Text style={style}>{before}</Text>
            <TextLink label={found()[0]} size={14} onPress={() => Pob.openUrl(found()[1])} />
            <Text style={style}>{after}</Text>
          </View>
        );
      }}
    </If>
  );
}

/** One choice among a few, side by side in one frame (a segmented tab): the chosen segment filled with brass. */
function Segmented(props: { items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <View
      role="tablist"
      style={{ flexDirection: "row", borderWidth: 1, borderColor: C.trim, backgroundColor: "rgba(0,0,0,0.55)", padding: 2, gap: 2 }}
    >
      <Each of={props.items}>
        {(item) => {
          const selected = () => props.value === item().value;
          const hover = signal(false);
          return (
            <View
              role="tab"
              testID={`tab-${item().value}`}
              onPress={() => props.onChange(item().value)}
              onMouseEnter={() => hover.set(true)}
              onMouseLeave={() => hover.set(false)}
              style={{
                flex: 1,
                height: 30,
                alignItems: "center",
                justifyContent: "center",
                backgroundImage: selected() ? "linear-gradient(180deg, #d9b46c, #a57c3c 55%, #7a5826)" : "none",
                backgroundColor: selected() ? "transparent" : hover() ? "rgba(177,141,78,0.14)" : "transparent",
                boxShadow: selected() ? "inset 0 1px 0 rgba(255,236,190,0.45), 0 1px 3px rgba(0,0,0,0.6)" : "none",
              }}
            >
              <Text
                style={{
                  fontFamily: BODY,
                  fontSize: 12,
                  fontWeight: selected() ? "700" : "400",
                  color: selected() ? C.ink : hover() ? "#fff3d0" : C.muted,
                  textShadow: selected() ? ENGRAVED : "none",
                }}
              >
                {item().label}
              </Text>
            </View>
          );
        }}
      </Each>
    </View>
  );
}

/** A choice among a few, as the language buttons: framed, the chosen one lit. */
function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  const hover = signal(false);
  return (
    <View
      role="button"
      onPress={props.onPress}
      onMouseEnter={() => hover.set(true)}
      onMouseLeave={() => hover.set(false)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: props.selected ? C.trimHi : hover() ? C.trim : "rgba(107,82,44,0.45)",
        backgroundColor: props.selected ? "rgba(177,141,78,0.22)" : "rgba(0,0,0,0.45)",
      }}
    >
      <Text style={{ fontFamily: BODY, fontSize: 12, color: props.selected ? "#fff3d0" : C.muted }}>{props.label}</Text>
    </View>
  );
}

/** A labelled input. `secret`: its text hidden, but for a press on its words for showing it (`[show, hide]`). */
function Field(props: {
  label: string;
  hint?: string;
  value: () => string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  link?: { label: string; onPress: () => void };
  secret?: [string, string];
}) {
  const shown = signal(false);
  const toggleHover = signal(false);
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{props.label}</Text>
        <If when={props.link}>{(link) => <TextLink label={link().label} onPress={link().onPress} />}</If>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: C.trim }}>
        <Input
          value={props.value()}
          onChange={(e) => props.onChange(e.value)}
          onSubmit={() => props.onSubmit?.()}
          placeholder={props.placeholder}
          masked={!!props.secret && !shown()}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            height: 30,
            paddingHorizontal: 10,
            fontFamily: BODY,
            fontSize: 13,
            color: C.text,
            placeholderColor: C.dim,
            caretColor: C.goldHi,
          }}
        />
        <If when={props.secret}>
          {(words) => (
            // The whole strip at the input's right end takes the press, not only its word: easy to hit.
            <View
              role="button"
              onPress={() => shown.set(!shown())}
              onMouseEnter={() => toggleHover.set(true)}
              onMouseLeave={() => toggleHover.set(false)}
              style={{
                height: 30,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderLeftWidth: 1,
                borderColor: C.trim,
                backgroundColor: toggleHover() ? "rgba(177,141,78,0.18)" : "transparent",
              }}
            >
              <Text style={{ fontFamily: BODY, fontSize: 12, color: toggleHover() ? "#fff3d0" : C.unique }}>{shown() ? words()[1] : words()[0]}</Text>
            </View>
          )}
        </If>
      </View>
      <If when={props.hint}>
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>{props.hint}</Text>
      </If>
    </View>
  );
}

/** A row of a tree of POB's builds: a folder, open or closed, or a build. */
function TreeRow(row: { label: string; kind: "open" | "closed" | "build"; depth: number; selected: boolean; onPress: () => void }) {
  const hover = signal(false);
  return (
    <View
      role="button"
      onPress={row.onPress}
      onMouseEnter={() => hover.set(true)}
      onMouseLeave={() => hover.set(false)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 8 + row.depth * 18,
        paddingRight: 8,
        paddingVertical: 5,
        backgroundColor: row.selected ? "rgba(177,141,78,0.28)" : hover() ? "rgba(177,141,78,0.12)" : "transparent",
      }}
    >
      <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
        <If when={row.kind !== "build"} else={<View style={{ width: 6, height: 6, backgroundColor: C.trimHi, transform: [{ rotate: "45deg" }] }} />}>
          <View style={{ width: 15, height: 15, borderWidth: 1, borderColor: C.trimHi, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: BODY, fontSize: 13, fontWeight: "700", lineHeight: 14, color: C.goldHi }}>{row.kind === "open" ? "−" : "+"}</Text>
          </View>
        </If>
      </View>
      <Text style={{ flex: 1, fontFamily: BODY, fontSize: 13, color: row.selected ? "#fff3d0" : C.text, numberOfLines: 1, textOverflow: "ellipsis-middle" }}>{row.label}</Text>
    </View>
  );
}

/** The rows of a tree of builds shown: the folders' contents under those `opened`, indented by depth from `depth`. */
function treeRows(tree: BuildEntry[], opened: string[], depth: number): { entry: BuildEntry; depth: number }[] {
  const out: { entry: BuildEntry; depth: number }[] = [];
  const walk = (list: BuildEntry[], depth: number) => {
    for (const entry of list) {
      out.push({ entry, depth });
      if (entry.dir && opened.includes(entry.path)) walk(entry.children ?? [], depth + 1);
    }
  };
  walk(tree, depth);
  return out;
}

/** Where to save the build just made, in POB's builds folder, shown as a tree: a folder for a new build (named
 * after the character, to begin with), or a build there to replace. `onClose` hears where it was saved, or null. */
function SaveTree(props: { s: AccountStrings; name: string; onClose: (saved: string | null) => void }) {
  const data: { root: string; tree: BuildEntry[] } = JSON.parse(Pob.builds() || '{"root":"","tree":[]}');
  const opened = signal<string[]>([]);
  // The folder chosen ("": the builds folder itself), or the build to replace.
  const folder = signal("");
  const file = signal<string | null>(null);
  const name = signal(props.name);

  const rows = () => treeRows(data.tree, opened(), 1);
  const press = (entry: BuildEntry) => {
    if (!entry.dir) {
      file.set(entry.path);
      return;
    }
    file.set(null);
    folder.set(entry.path);
    opened.set(opened().includes(entry.path) ? opened().filter((x) => x !== entry.path) : [...opened(), entry.path]);
  };
  const target = () => file() ?? (folder() ? `${folder()}/${name().trim()}` : name().trim());
  const save = () => {
    if (!file() && !name().trim()) return;
    const saved = Pob.saveBuild(target());
    if (saved.startsWith("error: ")) say(saved.slice("error: ".length), true);
    else props.onClose(saved);
  };

  return (
    <View
      onPress={() => props.onClose(null)}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
    >
      <View onPress={() => {}} style={{ ...PANEL, width: 560, gap: 12 }}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: "700", color: C.goldHi }}>{props.s.save.title}</Text>
        <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{props.s.save.hint}</Text>
        <View style={{ height: 300, borderWidth: 1, borderColor: C.trim, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Scroll style={{ flex: 1 }}>
            <View style={{ paddingVertical: 4 }}>
              <TreeRow label={props.s.save.root} kind="open" depth={0} selected={!file() && folder() === ""} onPress={() => (file.set(null), folder.set(""))} />
              <Each of={rows()}>
                {(row) => (
                  <TreeRow
                    label={row().entry.dir ? row().entry.name : row().entry.name.replace(/.xml$/i, "")}
                    kind={row().entry.dir ? (opened().includes(row().entry.path) ? "open" : "closed") : "build"}
                    depth={row().depth}
                    selected={row().entry.dir ? !file() && folder() === row().entry.path : file() === row().entry.path}
                    onPress={() => press(row().entry)}
                  />
                )}
              </Each>
            </View>
          </Scroll>
        </View>
        <If
          when={file()}
          else={<Field label={props.s.save.name} value={name} onChange={name.set} onSubmit={save} />}
        >
          <Text style={{ fontFamily: BODY, fontSize: 13, color: C.unique }}>{props.s.save.replaces(file() ?? "")}</Text>
        </If>
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim, numberOfLines: 1, textOverflow: "ellipsis-middle" }}>{data.root}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <SmallButton label={props.s.save.cancel} onPress={() => props.onClose(null)} />
          <Button label={file() ? props.s.save.overwrite : props.s.save.save} onPress={save} />
        </View>
      </View>
    </View>
  );
}

/** Characters from an account, on Path of Exile's site or Tencent's, or Path of Exile 2's signed in to, made builds: the
 * account (kept for next time, with the others used), its characters by league, and for each a build code to copy or a
 * build saved among POB's. */
function Characters(props: { settings: Settings; t: () => Strings; onBack: () => void }) {
  const a = () => accountStrings(props.settings.language);
  const accounts = signal<Account[]>(JSON.parse(Pob.accounts() || "[]"));
  // The game whose characters show: the launcher's, to begin with.
  const game = signal<Game>(props.settings.game);
  // An account is Path of Exile 2's, or Path of Exile's; the last used of a game.
  const ofGame = (acc: Account, g: Game) => POE2_REALMS.includes(acc.realm) === (g === "Poe2");
  const lastOf = (g: Game) => accounts().find((acc) => ofGame(acc, g));
  // Path of Exile 2's realm: the official site's (signed in to), or Tencent's (a WeGame share link); the last used.
  const poe2Realm = signal<Realm>(lastOf("Poe2")?.realm ?? (props.settings.language === "zh-rCN" ? "wegame" : "poe2"));
  const share = signal(lastOf("Poe2")?.realm === "wegame" ? lastOf("Poe2")!.sessid : "");
  const last = lastOf("Poe1");
  const realm = signal<Realm>(last?.realm ?? (props.settings.language === "zh-rCN" ? "tencent" : "pc"));
  const name = signal(last?.name ?? "");
  const sessid = signal(last?.sessid ?? "");
  // The account whose characters show, and them: the game's last one's, as they were last got.
  const lastShown = lastOf(game());
  const shown = signal<Account | null>(lastShown?.characters ? lastShown : null);
  const characters = signal<Character[]>(lastShown?.characters ?? []);
  const league = signal<string | null>(null);
  const job = signal<AccountProgress | null>(null);
  // Which character's action runs: its name and the action.
  const working = signal<string | null>(null);
  const running = () => job()?.state === "running";
  // The guide to the POESESSID, open.
  const guide = signal(false);
  // A build made, to save where the user says: its character's name, and what was left untranslated.
  const saving = signal<{ name: string; untranslated: string } | null>(null);
  const fail = (acc: Account, error: string) => say(errorText(a(), acc.realm, error), true);

  const leagues = () => [...new Set(characters().map((c) => c.league))];
  // The last played first (Tencent says when); else in the site's order.
  const listed = () =>
    characters()
      .filter((c) => league() === null || c.league === league())
      .sort((x, y) => (y.lastLoginTime ?? 0) - (x.lastLoginTime ?? 0));

  // An account used before: its characters as they were last got, or got now.
  const choose = (acc: Account) => {
    const poe2 = POE2_REALMS.includes(acc.realm);
    if (poe2) {
      poe2Realm.set(acc.realm);
      if (acc.realm === "wegame") share.set(acc.sessid);
    } else {
      realm.set(acc.realm);
      name.set(acc.name);
      sessid.set(acc.sessid);
    }
    if (!acc.characters) return fetchCharacters(poe2 ? acc : undefined);
    shown.set(acc);
    characters.set(acc.characters);
    league.set(null);
  };

  // The game shown, and its last account's characters.
  const showGame = (g: Game) => {
    game.set(g);
    const acc = lastOf(g);
    shown.set(acc?.characters ? acc : null);
    characters.set(acc?.characters ?? []);
    league.set(null);
  };

  // The characters of the account typed in; Path of Exile 2's, of the account given, or the WeGame share link pasted, or
  // the last signed in to (signing in first, in the browser, when it never was).
  const fetchCharacters = (poe2?: Account) => {
    if (running()) return;
    const acc: Account =
      game() === "Poe2"
        ? { ...(poe2 ??
            (poe2Realm() === "wegame"
              ? { realm: "wegame", name: "", sessid: share().trim() }
              : accounts().find((x) => x.realm === "poe2") ?? { realm: "poe2", name: "", sessid: "" })), characters: undefined }
        : { realm: realm(), name: realm() === "tencent" ? "" : name().trim(), sessid: sessid().trim() };
    if (!Pob.accountStart("characters", JSON.stringify({ account: acc }))) return;
    watchJob(Pob.accountProgress, job.set, (p) => {
      if (p.state === "failed") {
        fail(acc, p.error);
        return;
      }
      // The account as kept: named as the site spells it, with its characters.
      const got: Account = p.result;
      if (!["tencent", ...POE2_REALMS].includes(got.realm)) name.set(got.name);
      shown.set(got);
      characters.set(got.characters ?? []);
      league.set(null);
      accounts.set(JSON.parse(Pob.accounts() || "[]"));
    });
  };

  const forget = (acc: Account) => {
    accounts.set(accounts().filter((x) => !sameAccount(x, acc)));
    Pob.saveAccounts(JSON.stringify(accounts()));
  };

  const exportCharacter = (c: Character, action: "code" | "save") => {
    const acc = shown();
    if (running() || !acc) return;
    const sent = Pob.accountStart("export", JSON.stringify({ account: acc, character: c, pob_dir: dirOf(props.settings, POE2_REALMS.includes(acc.realm) ? "Poe2" : "Poe1") ?? "" }));
    if (!sent) return;
    working.set(`${c.name}\n${action}`);
    watchJob(Pob.accountProgress, job.set, async (p) => {
      working.set(null);
      if (p.state === "failed") {
        fail(acc, p.error);
        return;
      }
      const untranslated = p.result.untranslated > 0 ? ` · ${a().untranslated(p.result.untranslated)}` : "";
      if (action === "code") {
        await Clipboard.writeText(p.result.code);
        say(a().copied + untranslated);
      } else {
        // Where in POB's builds folder: the user says, in the tree.
        saving.set({ name: c.name, untranslated });
      }
    });
  };

  const stepText = () => (running() ? a().steps[job()!.step] ?? "…" : "");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
      <TitleBar t={props.t} onBack={props.onBack} backLabel={accountStrings(props.settings.language).back} />

      {/* The game: Path of Exile's characters, or Path of Exile 2's, which come from its API once signed in to */}
      <View style={{ paddingHorizontal: 32, paddingTop: 12 }}>
        <View style={{ width: 340 }}>
          <Segmented items={GAMES.map((g) => ({ value: g.id, label: props.t().games[g.id] }))} value={game()} onChange={(g) => showGame(g as Game)} />
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 20, paddingHorizontal: 32, paddingTop: 12, paddingBottom: 24 }}>
        {/* The account */}
        <View style={{ width: 340, gap: 20 }}>
          <If
            when={game() === "Poe1"}
            else={
              <View style={PANEL}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>{a().poe2.title}</Text>
                <Rule width={300} />
                <Segmented items={POE2_REALMS.map((r) => ({ value: r, label: a().realms[r] }))} value={poe2Realm()} onChange={(r) => poe2Realm.set(r as Realm)} />
                {/* The official site's, signed in to in the browser; Tencent's, by a WeGame share link */}
                <If
                  when={poe2Realm() === "wegame"}
                  else={
                    <View style={{ gap: 14 }}>
                      <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 20 }}>{a().poe2.body}</Text>
                      <View style={{ flexDirection: "row" }}>
                        <Button label={a().poe2.signIn} onPress={() => fetchCharacters()} />
                      </View>
                    </View>
                  }
                >
                  <Field label={a().poe2.share.label} hint={a().poe2.share.hint} placeholder="https://www.wegame.com.cn/helper/poe2/#/share/…" value={share} onChange={share.set} onSubmit={() => fetchCharacters()} />
                  <View style={{ flexDirection: "row" }}>
                    <Button label={a().poe2.share.fetch} onPress={() => fetchCharacters()} />
                  </View>
                </If>
              </View>
            }
          >
          <View style={PANEL}>
            <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>{a().title}</Text>
            <Rule width={300} />
            <Segmented items={REALMS.map((r) => ({ value: r, label: a().realms[r] }))} value={realm()} onChange={(r) => realm.set(r as Realm)} />
            {/* Tencent knows the account by its POESESSID alone */}
            <If when={realm() !== "tencent"}>
              <Field label={a().accountName} placeholder={a().accountHint} value={name} onChange={name.set} onSubmit={fetchCharacters} />
            </If>
            <Field label={a().sessid} hint={a().sessidHint(realm())} link={{ label: a().guide.link, onPress: () => guide.set(true) }} secret={[a().show, a().hide]} value={sessid} onChange={sessid.set} onSubmit={fetchCharacters} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Button label={a().fetch} onPress={fetchCharacters} />
              <SmallButton label={a().signIn} onPress={() => Pob.openUrl(realm() === "tencent" ? TENCENT_SITE : PC_SITE)} />
            </View>
          </View>
          </If>

          {/* The accounts used before, the game's */}
          <View style={{ ...PANEL, flex: 1, gap: 8 }}>
            <Text style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: "600", letterSpacing: 2, color: C.gold }}>{a().saved}</Text>
            <If when={accounts().some((acc) => ofGame(acc, game()))} else={<Text style={{ fontFamily: BODY, fontSize: 12, color: C.dim }}>{a().none}</Text>}>
              <Scroll style={{ flex: 1 }}>
                <View style={{ gap: 4 }}>
                  <Each of={accounts().filter((acc) => ofGame(acc, game()))}>
                    {(acc) => (
                      <View
                        role="button"
                        onPress={() => {
                          choose(acc());
                        }}
                        hoverStyle={{ backgroundColor: "rgba(177,141,78,0.14)" }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6 }}
                      >
                        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.unique, width: 70 }}>{a().realms[acc().realm]}</Text>
                        <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, flex: 1, numberOfLines: 1 }}>{accountLabel(acc())}</Text>
                        <SmallButton label={a().remove} onPress={() => forget(acc())} />
                      </View>
                    )}
                  </Each>
                </View>
              </Scroll>
            </If>
          </View>
        </View>

        {/* Its characters */}
        <View style={{ ...PANEL, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", color: C.goldHi, flex: 1, numberOfLines: 1 }}>
              {/* The realm, and the account by its name: Tencent's, known by its POESESSID, has none to show */}
              {shown() ? [a().realms[shown()!.realm], shown()!.name].filter(Boolean).join(" · ") : a().title}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{stepText() || (shown()?.updated ? a().updated(shown()!.updated!) : "")}</Text>
            <If when={shown()}>
              {(acc) => <SmallButton label={a().refresh} disabled={running()} onPress={() => choose({ ...acc(), characters: undefined })} />}
            </If>
          </View>
          <If when={leagues().length > 1}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Chip label={a().all} selected={league() === null} onPress={() => league.set(null)} />
              <Each of={leagues()}>{(l) => <Chip label={l()} selected={league() === l()} onPress={() => league.set(l())} />}</Each>
            </View>
          </If>
          <If
            when={characters().length > 0}
            else={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: C.dim }}>{a().empty}</Text>
              </View>
            }
          >
            <Scroll style={{ flex: 1 }}>
              <View style={{ gap: 2 }}>
                <Each of={listed()}>
                  {(c) => {
                    const busy = (action: string) => working() === `${c().name}\n${action}`;
                    return (
                      <View
                        hoverStyle={{ backgroundColor: "rgba(177,141,78,0.1)" }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: "rgba(107,82,44,0.25)" }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontFamily: BODY, fontSize: 14, fontWeight: "700", color: C.text, numberOfLines: 1 }}>{c().name}</Text>
                          <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted, numberOfLines: 1 }}>
                            {c().class} · {a().level(c().level)} · {c().league}
                          </Text>
                        </View>
                        <SmallButton label={busy("code") ? stepText() || "…" : a().copyCode} disabled={running()} accent onPress={() => exportCharacter(c(), "code")} />
                        <SmallButton label={busy("save") ? stepText() || "…" : a().saveToPob} disabled={running()} onPress={() => exportCharacter(c(), "save")} />
                      </View>
                    );
                  }}
                </Each>
              </View>
            </Scroll>
          </If>
        </View>
      </View>

      {/* How to get the POESESSID, over the page */}
      <If when={guide()}>
        <View
          onPress={() => guide.set(false)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
        >
          {/* Its presses are its own: only one outside it closes it */}
          <View onPress={() => {}} style={{ ...PANEL, width: 620, gap: 16 }}>
            <Text style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: "700", color: C.goldHi }}>{a().guide.title}</Text>
            <Rule width={580} />
            <View style={{ gap: 12 }}>
              <Each of={a().guide.steps(realm())}>
                {(step, i) => (
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.trimHi, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: BODY, fontSize: 12, fontWeight: "700", color: C.goldHi }}>{i() + 1}</Text>
                    </View>
                    <GuideStep text={step()} />
                  </View>
                )}
              </Each>
            </View>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.unique, lineHeight: 18 }}>{a().guide.warn}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <SmallButton label={a().signIn} onPress={() => Pob.openUrl(realm() === "tencent" ? TENCENT_SITE : PC_SITE)} />
              <Button label={a().guide.close} onPress={() => guide.set(false)} />
            </View>
          </View>
        </View>
      </If>
      <If when={saving()}>
        {(build) => (
          <SaveTree
            s={a()}
            name={build().name}
            onClose={(path) => {
              // Read before the build goes: closing the tree drops it.
              const untranslated = build().untranslated;
              saving.set(null);
              // The build's name: its file's, without ".xml".
              if (path) say(a().savedTo(path.split(/[\\/]/).pop()!.replace(/\.xml$/i, "")) + untranslated);
            }}
          />
        )}
      </If>

    </View>
  );
}

/** A build analysed by an AI already on the user's computer, Claude Code or Codex: the agent, the build (one of
 * POB's, a file, or a build code) and a question of the user's; then the report, overall and by dimension (damage,
 * defence, recovery, ailments, utility, gear). The analysis goes on if the page is left, and shows on coming back. */
function Analysis(props: { settings: Settings; t: () => Strings; onBack: () => void }) {
  const s = () => analysisStrings(props.settings.language);
  const agents = signal<Agent[]>(JSON.parse(Pob.aiAgents() || "[]"));
  const agent = signal<string>(agents()[0]?.id ?? "");
  const roots = signal<BuildRoot[]>(JSON.parse(Pob.aiBuilds() || "[]"));
  const source = signal<"builds" | "code">("builds");
  const opened = signal<string[]>(roots().length === 1 ? [roots()[0].root] : []);
  // The build chosen: its file's whole path.
  const build = signal<string | null>(null);
  // Choosing a build shows the report kept beside it, if one (unless an analysis runs).
  const choose = (path: string) => {
    build.set(path);
    if (running()) return;
    const kept = Pob.aiSaved(path);
    job.set(kept ? JSON.parse(kept) : null);
  };
  const code = signal("");
  const question = signal("");
  const job = signal<AiProgress | null>(null);
  const seconds = signal(0);
  const running = () => job()?.state === "running";

  const lookAgain = () => {
    agents.set(JSON.parse(Pob.aiAgents() || "[]"));
    if (!agents().some((a) => a.id === agent())) agent.set(agents()[0]?.id ?? "");
    roots.set(JSON.parse(Pob.aiBuilds() || "[]"));
  };
  const toggle = (path: string) => opened.set(opened().includes(path) ? opened().filter((x) => x !== path) : [...opened(), path]);
  const pick = async () => {
    const file = await Pob.pickBuild();
    if (file) {
      source.set("builds");
      choose(file);
    }
  };

  // Watches the analysis until it ends, counting the seconds it takes.
  const watch = () =>
    watchAnalysis((p, secs) => {
      job.set(p);
      seconds.set(secs);
      if (p?.state === "failed") say(aiErrorText(s(), p.error), true);
    });
  // One running or done before: shown, and watched on.
  const last = Pob.aiProgress();
  if (last) {
    job.set(JSON.parse(last));
    if (running()) watch();
  }

  const analyse = () => {
    if (running() || !agent()) return;
    // A build's file keeps its report beside it (`<name>.ai.json`), for the editor too
    const from = source() === "code" ? { code: code().trim() } : { path: build() ?? "", save_to: build() ?? "" };
    if (!("code" in from ? from.code : from.path)) return;
    const sent = Pob.aiStart(JSON.stringify({ agent: agent(), ...from, language: s().answerIn, question: question().trim() }));
    if (sent) watch();
  };

  const report = () => (job()?.state === "done" ? job()!.report : null);
  const copy = async () => {
    const r = report();
    await Clipboard.writeText(r ? reportText(s(), r) : job()?.raw ?? "");
    say(s().copied);
  };
  const agentName = (id: string) => agents().find((a) => a.id === id)?.name ?? id;
  const fileName = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.xml$/i, "");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
      <TitleBar t={props.t} onBack={props.onBack} backLabel={s().back} />

      <View style={{ flex: 1, flexDirection: "row", gap: 20, paddingHorizontal: 32, paddingTop: 12, paddingBottom: 24 }}>
        {/* What to analyse, and with which AI */}
        <View style={{ ...PANEL, width: 360 }}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>{s().title}</Text>
          <Rule width={320} />
          <If
            when={agents().length > 0}
            else={
              <View style={{ gap: 10 }}>
                <Text style={{ fontFamily: BODY, fontSize: 14, fontWeight: "700", color: C.unique }}>{s().noAgent.title}</Text>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 20 }}>{s().noAgent.body}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <SmallButton label={s().noAgent.claude} onPress={() => Pob.openUrl(AGENT_SITES.claude)} />
                  <SmallButton label={s().noAgent.codex} onPress={() => Pob.openUrl(AGENT_SITES.codex)} />
                  <SmallButton label={s().noAgent.refresh} accent onPress={lookAgain} />
                </View>
              </View>
            }
          >
            <View style={{ gap: 5 }}>
              <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{s().agent}</Text>
              <Segmented items={agents().map((a) => ({ value: a.id, label: a.name }))} value={agent()} onChange={agent.set} />
            </View>
          </If>
          <Segmented
            items={[
              { value: "builds", label: s().source.builds },
              { value: "code", label: s().source.code },
            ]}
            value={source()}
            onChange={(v) => source.set(v as "builds" | "code")}
          />
          <If
            when={source() === "builds"}
            else={<Field label={s().codeLabel} hint={s().codeHint} placeholder="eNrtvVtz…" value={code} onChange={code.set} onSubmit={analyse} />}
          >
            <View style={{ flex: 1, minHeight: 120, borderWidth: 1, borderColor: C.trim, backgroundColor: "rgba(0,0,0,0.5)" }}>
              <If
                when={roots().length > 0}
                else={
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 12 }}>
                    <Text style={{ fontFamily: BODY, fontSize: 12, color: C.dim, textAlign: "center" }}>{s().noBuilds}</Text>
                  </View>
                }
              >
                <Scroll style={{ flex: 1 }}>
                  <View style={{ paddingVertical: 4 }}>
                    <Each of={roots()}>
                      {(root) => (
                        <View>
                          <TreeRow label={root().root} kind={opened().includes(root().root) ? "open" : "closed"} depth={0} selected={false} onPress={() => toggle(root().root)} />
                          <If when={opened().includes(root().root)}>
                            {/* Folders opened are kept by their whole paths: each root's, from it */}
                            <Each of={treeRows(root().tree, opened().filter((p) => p.startsWith(`${root().root}/`)).map((p) => p.slice(root().root.length + 1)), 1)}>
                              {(row) => {
                                const full = () => `${root().root}/${row().entry.path}`;
                                return (
                                  <TreeRow
                                    label={row().entry.dir ? row().entry.name : row().entry.name.replace(/.xml$/i, "")}
                                    kind={row().entry.dir ? (opened().includes(full()) ? "open" : "closed") : "build"}
                                    depth={row().depth}
                                    selected={!row().entry.dir && build() === full()}
                                    onPress={() => (row().entry.dir ? toggle(full()) : choose(full()))}
                                  />
                                );
                              }}
                            </Each>
                          </If>
                        </View>
                      )}
                    </Each>
                  </View>
                </Scroll>
              </If>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: build() ? C.unique : C.dim, numberOfLines: 1 }}>{build() ? fileName(build()!) : ""}</Text>
              <SmallButton label={s().pickFile} onPress={pick} />
            </View>
          </If>
          <Field label={s().question} placeholder={s().questionHint} value={question} onChange={question.set} onSubmit={analyse} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <Button label={s().analyse} onPress={analyse} />
          </View>
        </View>

        {/* The analysis running, how it ended, or its report */}
        <View style={{ flex: 1 }}>
          <If when={running() ? job() : null}>
            {(j) => <AnalysisRunning s={s()} job={j()} seconds={seconds()} agentName={agentName(j().agent)} onStop={() => Pob.aiCancel()} />}
          </If>
          <If when={job()?.state === "failed" || job()?.state === "cancelled" ? job() : null}>{(j) => <AnalysisFailed s={s()} job={j()} />}</If>
          <If when={!job()}>
            <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: C.dim, maxWidth: 420, textAlign: "center", lineHeight: 20 }}>{s().empty}</Text>
            </View>
          </If>
          <If when={job()?.state === "done" ? job() : null}>
            {(j) => <AnalysisReport s={s()} job={j()} meta={s().madeBy(agentName(j().agent), whenText(j().finished))} onCopy={copy} />}
          </If>
        </View>
      </View>
    </View>
  );
}

/** Tools → Smart loot filter: a Path of Exile item filter from the league's prices now, by strictness or by the
 * player's own threshold, written where the game reads filters (`lootfilter.ts`). */
function LootFilter(props: { settings: Settings; t: () => Strings; onBack: () => void }) {
  const s = () => filterStrings(props.settings.language);
  const strictness = signal<Strictness>("regular");
  const custom = signal("");
  const step = signal<{ done: number; of: number } | null>(null);
  const result = signal<FilterResult | null>(null);
  const error = signal<string | null>(null);
  const generate = async () => {
    if (step()) return;
    const text = custom().trim();
    const minWorth = text ? Number(text) : undefined;
    if (minWorth !== undefined && !(minWorth >= 0)) {
      say(s().badNumber, true);
      return;
    }
    error.set(null);
    step.set({ done: 0, of: 1 });
    try {
      result.set(await makeFilter(strictness(), minWorth, (done, of) => step.set({ done, of })));
    } catch (e) {
      error.set(String((e as Error)?.message ?? e));
    }
    step.set(null);
  };
  const dirOfPath = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
  const chaos = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
      <TitleBar t={props.t} onBack={props.onBack} backLabel={s().back} />

      <View style={{ flex: 1, flexDirection: "row", gap: 20, paddingHorizontal: 32, paddingTop: 12, paddingBottom: 24 }}>
        {/* How strict, and making it */}
        <View style={{ ...PANEL, width: 360 }}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>{s().title}</Text>
          <Rule width={320} />
          <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 20 }}>{s().intro}</Text>
          <View style={{ gap: 5 }}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{s().strictness}</Text>
            <Segmented items={STRICTNESS.map((v) => ({ value: v, label: s().levels[v] }))} value={strictness()} onChange={(v) => strictness.set(v as Strictness)} />
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{s().levelHint[strictness()]}</Text>
          </View>
          <Field label={s().custom} hint={s().customHint} placeholder={`${MIN_WORTH[strictness()]}`} value={custom} onChange={custom.set} onSubmit={generate} />
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <If when={step()}>{(p) => <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.muted }}>{s().fetching(p().done, p().of)}</Text>}</If>
            <Button label={s().generate} onPress={generate} />
          </View>
        </View>

        {/* What was made */}
        <View style={{ flex: 1 }}>
          <If when={error()}>
            {(e) => (
              <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: C.red, maxWidth: 460, textAlign: "center", lineHeight: 20 }}>{s().failed(e())}</Text>
              </View>
            )}
          </If>
          <If when={!error() && !result()}>
            <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: C.dim, maxWidth: 420, textAlign: "center", lineHeight: 20 }}>{s().empty}</Text>
            </View>
          </If>
          <If when={!error() ? result() : null}>
            {(r) => (
              <View style={{ ...PANEL, flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 28 }}>
                  <FilterFact label={s().league} value={r().league} />
                  <FilterFact label={s().pricedAt} value={new Date(r().at).toLocaleString()} />
                  <FilterFact label={"\u00a0"} value={s().divine(chaos(r().divine))} />
                </View>
                <Rule width={560} dim />
                <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{s().tierRules}</Text>
                <View style={{ gap: 6 }}>
                  <Each of={r().tiers}>
                    {(tier) => (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Text style={{ width: 150, fontFamily: BODY, fontSize: 13, color: C.text }}>{tier().label}</Text>
                        <Text style={{ fontFamily: BODY, fontSize: 13, color: C.unique, fontVariant: ["tabular-nums"] }}>{s().rules(tier().rules)}</Text>
                      </View>
                    )}
                  </Each>
                  <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{s().total(r().rules)}</Text>
                </View>
                <Rule width={560} dim />
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{s().written}</Text>
                  <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text }}>{r().path}</Text>
                </View>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 20 }}>{s().reload}</Text>
                <View style={{ flexDirection: "row" }}>
                  <SmallButton label={s().openFolder} onPress={() => Pob.openDir(dirOfPath(r().path))} />
                </View>
              </View>
            )}
          </If>
        </View>
      </View>
    </View>
  );
}

/** A labelled value at the top of the filter's result: its league, its prices' time. */
function FilterFact(props: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ fontFamily: BODY, fontSize: 11, color: C.muted }}>{props.label}</Text>
      <Text style={{ fontFamily: BODY, fontSize: 14, fontWeight: "700", color: C.goldHi }}>{props.value}</Text>
    </View>
  );
}

// How far POB has loaded (`Pob.loadProgress`).
interface LoadProgress {
  loaded: boolean;
  steps: number;
  expected: number | null;
  message: string;
}

/** Over Path of Building until it has loaded: the doorway, the title, a bar filling as POB loads its modules (as far
 * as it took last time; the first time, an estimate) and what it says it is doing. */
function Loading(props: { t: () => Strings; progress: () => LoadProgress }) {
  const fraction = () => {
    const p = props.progress();
    return p.expected ? Math.min(p.steps / p.expected, 0.99) : 1 - Math.exp(-p.steps / 160);
  };
  const BAR = 480;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <Image src={title} style={{ width: 560, height: 77 }} />
      <Rule width={420} />
      <Text style={{ fontFamily: BODY, fontSize: 15, color: C.text, textShadow: "0 0 3px #000, 0 0 8px #000, 0 1px 2px #000" }}>{props.t().loading}</Text>
      {/* The bar: a gold-trimmed groove, filled red as the start button is */}
      <View
        style={{
          width: BAR,
          height: 14,
          borderWidth: 1,
          borderColor: C.trimHi,
          backgroundColor: "rgba(0,0,0,0.75)",
          boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.8), 0 0 0 1px #000, 0 6px 16px rgba(0,0,0,0.7)",
          padding: 2,
        }}
      >
        <View
          style={{
            width: (BAR - 6) * fraction(),
            height: 8,
            backgroundImage: "linear-gradient(180deg, #c0473a, #8e2218 45%, #5e1209)",
            boxShadow: "0 0 8px rgba(224,96,74,0.55)",
          }}
        />
      </View>
      <Text style={{ fontFamily: BODY, fontSize: 12, color: C.muted, height: 18, textShadow: "0 1px 2px #000", numberOfLines: 1 }}>
        {props.progress().expected ? `${Math.round(fraction() * 100)}%  ·  ` : ""}
        {props.progress().message}
      </Text>
    </View>
  );
}

export function App() {
  checkUpdates();
  // No system title bar: the app draws its own (TitleBar).
  currentWindow().set({ titleBar: { style: "hidden", height: TITLE_BAR } });
  const running = signal(false);
  // POB loading, polled from its start until it has loaded.
  const progress = signal<LoadProgress>({ loaded: false, steps: 0, expected: null, message: "" });
  const watchLoading = () => {
    const p: LoadProgress = JSON.parse(Pob.loadProgress());
    progress.set(p);
    if (!p.loaded && running()) setTimeout(watchLoading, 80);
  };
  const start = () => {
    progress.set({ loaded: false, steps: 0, expected: null, message: "" });
    running.set(true);
    watchLoading();
  };
  const t = () => strings((JSON.parse(Pob.settings()) as Settings).language);
  // Back to the launcher: POB quits as it would on closing (asking about unsaved changes first: it may stay, or quit
  // once the user answers), then the launcher shows.
  const back = () => {
    Pob.leave();
    const poll = () => {
      const state = Pob.left();
      if (state === "left") running.set(false);
      else if (running()) setTimeout(poll, state === "waiting" ? 50 : 250);
    };
    poll();
  };
  // The Characters page, over whatever shows: the launcher, or Path of Building, which goes on under it.
  const characters = signal(false);
  const openCharacters = () => (analysis.set(false), filter.set(false), characters.set(true));
  // The Analysis page, as the Characters page is.
  const analysis = signal(false);
  const openAnalysis = () => (characters.set(false), filter.set(false), analysis.set(true));
  // The smart loot filter page, as the Characters page is.
  const filter = signal(!!Pob.devEnv("POBT_FILTER"));
  const openFilter = () => (characters.set(false), analysis.set(false), filter.set(true));
  // The launcher is the way in: Start opens POBT's build editor (it runs the chosen game's Path of Building with no
  // window), or, with "classic" checked, the classic Lua Path of Building. The editor's Tools menu goes back to it.
  // POBT_EDITOR=1 opens the editor at once (development: POBT_BUILD names a build file to open).
  const editor = signal(!!Pob.devEnv("POBT_EDITOR"));
  if (editor()) useLanguageOnce();
  const openEditor = () => {
    useLanguageOnce();
    characters.set(false);
    analysis.set(false);
    filter.set(false);
    editor.set(true);
  };
  return (
    <View style={{ flex: 1 }}>
      <If
        when={running()}
        else={
          <If when={editor()} else={<Launcher onStart={start} onCharacters={openCharacters} onAnalysis={openAnalysis} onFilter={openFilter} onEditor={openEditor} />}>
            <View style={{ flex: 1 }}>
              <TitleBar t={t} solid onBack={() => editorBack() || editor.set(false)} backLabel={editorBackLabel()} onCharacters={openCharacters} onAnalysis={openAnalysis} onFilter={openFilter} onLegacy={() => editor.set(false)} legacyText={launcherLabel()} />
              <BuildEditor file={(Pob.devEnv("POBT_BUILD") || undefined)} game={(JSON.parse(Pob.settings()) as Settings).game === "Poe2" ? "poe2" : "poe1"} onBack={() => editor.set(false)} />
            </View>
          </If>
        }
      >
        <View style={{ flex: 1 }}>
          <TitleBar t={t} solid onBack={back} onCharacters={openCharacters} onAnalysis={openAnalysis} onFilter={openFilter} />
          <View style={{ flex: 1 }}>
            <PobCanvas style={{ flex: 1 }} />
            <If when={!progress().loaded}>
              <Loading t={t} progress={progress} />
            </If>
          </View>
        </View>
      </If>
      <If when={characters()}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <Characters settings={JSON.parse(Pob.settings()) as Settings} t={t} onBack={() => characters.set(false)} />
        </View>
      </If>
      <If when={analysis()}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <Analysis settings={JSON.parse(Pob.settings()) as Settings} t={t} onBack={() => analysis.set(false)} />
        </View>
      </If>
      <If when={filter()}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <LootFilter settings={JSON.parse(Pob.settings()) as Settings} t={t} onBack={() => filter.set(false)} />
        </View>
      </If>
      <Toast />
    </View>
  );
}
