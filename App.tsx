import { createAnimatedValue, Easing, Image, mount, Shader, signal, Text, View, type ViewStyle } from "nsh";
import { currentWindow } from "nsh/desktop";
import { checkForUpdate, downloadUpdate, installAndRestart, installOnQuit, shellInfo, type AppUpdate } from "nsh/updater";
import { Pob, PobCanvas } from "pobt/native";
import Cinzel from "./assets/fonts/Cinzel-Bold.woff2";
import "./assets/fonts/Cinzel-SemiBold.woff2";
import plaques from "./assets/ui/plaques.png";
import title from "./assets/ui/title.png";
import { GATE, GATE_MOTION } from "./gate";
// The icon at the size the launcher shows it (icon.png is the app's, 1024 square).
import icon from "./assets/ui/icon-64.png";
type Game = "Poe1" | "Poe2";

interface Settings {
  poe1_dir: string | null;
  poe2_dir: string | null;
  game: Game;
  language: string | null;
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
  download: string;
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
    download: "Download",
  },
  "zh-rCN": {
    games: { Poe1: "流放之路", Poe2: "流放之路 2" },
    subtitle: "POB 构筑的多语言翻译",
    pobFolder: "PATH OF BUILDING",
    notFound: "未找到 Path of Building，请选择它的安装目录",
    pick: "选择目录…",
    install: "安装",
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
    download: "下载",
  },
  "zh-rTW": {
    games: { Poe1: "流亡黯道", Poe2: "流亡黯道 2" },
    subtitle: "POB 構築的多語言翻譯",
    pobFolder: "PATH OF BUILDING",
    notFound: "找不到 Path of Building，請選擇它的安裝目錄",
    pick: "選擇目錄…",
    install: "安裝",
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
    download: "下載",
  },
  "ko-KR": {
    games: { Poe1: "패스 오브 엑자일", Poe2: "패스 오브 엑자일 2" },
    subtitle: "Path of Building을 당신의 언어로",
    pobFolder: "PATH OF BUILDING",
    notFound: "Path of Building을 찾을 수 없습니다. 폴더를 선택하세요",
    pick: "폴더 선택…",
    install: "설치",
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
    download: "다운로드",
  },
};

function strings(language: string | null): Strings {
  return UI[language ?? "en"] ?? UI.en;
}

// Path of Exile 2's look: near-black stone, low saturation, white text, a dark red accent.
// Path of Exile 2's look: aged gold trim, plaques with pointed ends, cold light through a gothic door.
const C = {
  bg: "#07080a",
  panel: "rgba(5,6,9,0.9)",
  trim: "#6b522c",
  trimHi: "#b18d4e",
  gold: "#d8bd85",
  goldHi: "#dcc792",
  text: "#cfc8bb",
  muted: "#948b7b",
  dim: "#655d50",
  ink: "#140d05",
  unique: "#e6894a",
  red: "#e0604a",
};
const DISPLAY = `${Cinzel}, Microsoft YaHei, Malgun Gothic, serif`;
const BODY = "Microsoft YaHei, Malgun Gothic, Segoe UI, sans-serif";

// Buttons light up under the pointer; pressed, their plaque is drawn sunk in (the atlas' pressed rows).
// Letters cut into brass: dark, with light catching their lower edge.
const ENGRAVED = "0 1px 0 rgba(255,236,190,0.45)";
const HOVER: ViewStyle = { filter: "brightness(1.18)" };
/** A button that sinks when pressed, and stays down a moment after a quick click so the press is seen: `children`
 * is given whether it is down. */
function PressButton(props: { onPress: () => void; style: ViewStyle; children: (down: () => boolean) => any }) {
  const down = signal(false);
  let release: ReturnType<typeof setTimeout> | undefined;
  return (
    <View
      role="button"
      onPress={props.onPress}
      onPressDown={() => {
        clearTimeout(release);
        down.set(true);
      }}
      onPressUp={() => {
        release = setTimeout(() => down.set(false), 120);
      }}
      style={props.style}
      hoverStyle={down() ? undefined : HOVER}
    >
      {props.children(down)}
    </View>
  );
}

// The plaques' atlas (scripts/ui-art.mjs): a row per kind, each a left cap, a middle that stretches and a right cap.
const ATLAS = { width: 640, rowHeight: 96, cap: 64, middle: 512 };
const ROWS = { red: 0, dark: 1, brass: 2 };
const KINDS = 3; // then the same, pressed
type PlaqueKind = keyof typeof ROWS;

/** A part of a plaque's row: the atlas, scaled to `sx` across and `sy` down, moved so `x` sits at the left. */
function AtlasPart(props: { row: () => number; x: number; sx: () => number; sy: number; style: ViewStyle }) {
  return (
    <View style={{ overflow: "hidden", ...props.style }}>
      <Image
        src={plaques}
        style={{
          position: "absolute",
          left: -props.x * props.sx(),
          top: -props.row() * ATLAS.rowHeight * props.sy,
          width: ATLAS.width * props.sx(),
          height: ATLAS.rowHeight * KINDS * 2 * props.sy,
          objectFit: "fill",
        }}
      />
    </View>
  );
}

/** A tarnished gold rule with a jewelled diamond at its middle. */
function Rule(props: { width: number; dim?: boolean }) {
  const line = (dir: string) => ({ flex: 1, height: 2, backgroundImage: `linear-gradient(${dir}, rgba(143,118,70,0), #b9a370)`, boxShadow: "0 1px 0 rgba(0,0,0,0.6)" });
  return (
    <View style={{ width: props.width, height: 18, flexDirection: "row", alignItems: "center", alignSelf: "center", opacity: props.dim ? 0.5 : 1 }}>
      <View style={line("90deg")} />
      <View style={{ width: 12, height: 12, marginHorizontal: 4, transform: [{ rotate: "45deg" }], borderWidth: 2, borderColor: "#a68d5a", backgroundColor: "#640d0e", boxShadow: "0 0 0 1px #000" }} />
      <View style={line("270deg")} />
    </View>
  );
}

/** A plaque with pointed ends, `height` tall, its content centred over it. */
function Plaque(props: { kind: () => PlaqueKind; height: number; pressed?: () => boolean; children: any }) {
  const s = props.height / ATLAS.rowHeight;
  const cap = ATLAS.cap * s;
  const down = () => props.pressed?.() ?? false;
  const row = () => ROWS[props.kind()] + (down() ? KINDS : 0);
  // The middle stretches across: its scale follows its width.
  const middleWidth = signal(ATLAS.middle * s);
  return (
    <View style={{ height: props.height, flexDirection: "row" }}>
      <AtlasPart row={row} x={0} sx={() => s} sy={s} style={{ width: cap, height: props.height }} />
      <View style={{ flex: 1, height: props.height }} onLayout={(e) => middleWidth.set(e.bounds.size.width)}>
        <AtlasPart
          row={row}
          x={ATLAS.cap}
          sx={() => middleWidth() / ATLAS.middle}
          sy={s}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
      <AtlasPart row={row} x={ATLAS.cap + ATLAS.middle} sx={() => s} sy={s} style={{ width: cap, height: props.height }} />
      <View
        style={{
          position: "absolute",
          top: down() ? 2 : 0,
          bottom: down() ? -2 : 0,
          left: cap * 0.75,
          right: cap * 0.75,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

function dirOf(s: Settings, game: Game): string | null {
  return game === "Poe1" ? s.poe1_dir : s.poe2_dir;
}

/** The start button: the red banner with gold trim. */
function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <PressButton onPress={props.onPress} style={{ width: 360 }}>
      {(down) => (
        <Plaque kind={() => "red"} height={64} pressed={down}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: "700", letterSpacing: 6, color: "#f6e6c2" }}>{props.label}</Text>
        </Plaque>
      )}
    </PressButton>
  );
}

/** A small brass button, as the site's store buttons. */
function Button(props: { label: string; onPress: () => void }) {
  return (
    <PressButton onPress={props.onPress} style={{ minWidth: 150 }}>
      {(down) => (
        <Plaque kind={() => "brass"} height={38} pressed={down}>
        <Text style={{ fontFamily: BODY, fontSize: 13, fontWeight: "700", color: C.ink, textShadow: ENGRAVED }}>{props.label}</Text>
        </Plaque>
      )}
    </PressButton>
  );
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

// Checks for a newer POBT at start. A newer version downloads on its own and replaces the app when it quits; the
// badge beside the title offers to restart into it now.
function UpdateBadge(props: { t: () => Strings }) {
  const update = signal<AppUpdate | null>(null);
  const state = signal<"found" | "downloading" | "ready" | "failed">("found");
  const progress = signal(0);
  const failure = signal("");

  checkForUpdate()
    .then(async (u) => {
      update.set(u);
      if (!u?.canInstall) return;
      state.set("downloading");
      await downloadUpdate(({ received, total }) => progress.set(total ? received / total : 0));
      await installOnQuit();
      state.set("ready");
    })
    .catch((e) => {
      if (update()) {
        failure.set(String(e));
        state.set("failed");
      }
    });

  const message = (u: AppUpdate) => {
    const t = props.t();
    switch (state()) {
      case "downloading":
        return t.downloading(u.version, Math.round(progress() * 100));
      case "ready":
        return t.ready(u.version);
      case "failed":
        return t.failed(failure());
      default:
        return t.released(u.version);
    }
  };

  return (
    <If when={update()}>
      {(u) => (
        <View
          role="button"
          onPress={() => (state() === "ready" ? installAndRestart() : !u().canInstall ? Pob.openUrl(u().url) : undefined)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: C.trim,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
          hoverStyle={{ borderColor: C.trimHi }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.unique }} />
          <Text style={{ fontFamily: BODY, fontSize: 12, color: C.text }}>{message(u())}</Text>
          <If when={state() === "ready"}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.unique }}>{props.t().restart} ›</Text>
          </If>
        </View>
      )}
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

function GameCard(props: {
  game: Game;
  settings: () => Settings;
  t: () => Strings;
  installing: () => InstallProgress | null;
  onSelect: () => void;
  onPick: () => void;
  onInstall: () => void;
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
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 12,
            color: install() ? (install()!.phase === "failed" ? C.red : C.gold) : dir() ? C.muted : C.red,
            textAlign: "center",
            numberOfLines: 2,
          }}
        >
          {install() ? status(install()!) : (dir() ?? props.t().notFound)}
        </Text>
        {/* No Path of Building yet: install it from its release, or choose where it is */}
        <View style={{ flexDirection: "row", gap: 12, opacity: busy() ? 0.5 : 1 }}>
          <If when={!dir()}>
            <Button label={props.t().install} onPress={() => !busy() && props.onInstall()} />
          </If>
          <Button label={props.t().pick} onPress={() => !busy() && props.onPick()} />
        </View>
      </View>
      {/* Its title plaque, set over the top edge */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
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

// The backdrop's motion runs on its own clock at 24 frames a second: the drift is slow, and the screen's full rate
// would redraw the whole window for nothing. (A day of seconds; then it stops.)
const motionTime = createAnimatedValue(0);
motionTime.timing(86400, { duration: 86400 * 1000, easing: Easing.linear, frameRate: 24 });

const TITLE_BAR = 44;

/** The window's title bar, drawn by the app: POBT at the left (a link to the site), the version and a newer one when
 * there is; the system draws the window's buttons at its right end. Dragging it moves the window. Over the launcher's backdrop it is clear;
 * over Path of Building, `solid`, with a way back to the launcher (`onBack`). */
function TitleBar(props: { t: () => Strings; solid?: boolean; onBack?: () => void }) {
  const brandHover = signal(false);
  const backHover = signal(false);
  const win = currentWindow();
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        height: TITLE_BAR,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 20,
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
            <Text style={{ fontSize: 9, color: backHover() ? "#fff3d0" : C.trimHi }}>◀</Text>
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
              {props.t().back.toUpperCase()}
            </Text>
          </View>
        )}
      </If>
      <View style={{ flex: 1 }} />
      <UpdateBadge t={props.t} />
      {/* The packaged version; a development run has none to show. */}
      <If when={shellInfo().version}>
        {(v) => <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>v{v()}</Text>}
      </If>
    </View>
  );
}

function Launcher(props: { onStart: () => void }) {
  const settings = signal<Settings>(JSON.parse(Pob.settings()));
  const available = new Set<string>(JSON.parse(Pob.languages()).map((l: { value: string }) => l.value));
  const languages = LANGUAGES.filter((l) => l.value === null || available.has(l.value));
  const error = signal("");
  const t = () => strings(settings().language);

  const update = (change: Partial<Settings>) => settings.set({ ...settings(), ...change });

  const pick = async (game: (typeof GAMES)[number]) => {
    const dir = await Pob.pickDir();
    if (!dir) return;
    if (!Pob.isPobDir(dir, game.key)) {
      error.set(t().notPobDir(dir, t().games[game.id]));
      return;
    }
    error.set("");
    update(game.id === "Poe1" ? { poe1_dir: dir, game: game.id } : { poe2_dir: dir, game: game.id });
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
    error.set("");
    Pob.install(game.key);
    update({ game: game.id });
    watchInstall();
  };
  watchInstall();

  const start = () => {
    const s = settings();
    const dir = dirOf(s, s.game);
    if (!dir) {
      error.set(t().needDir);
      return;
    }
    Pob.saveSettings(JSON.stringify(s));
    const err = Pob.start(dir, s.language ?? "");
    if (err) {
      error.set(err);
      return;
    }
    props.onStart();
  };


  const chooseLanguage = (value: string | null) => {
    update({ language: value });
    error.set("");
    Pob.saveSettings(JSON.stringify(settings()));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Shader source={GATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <Shader source={GATE_MOTION} uniforms={{ time: motionTime }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />

      <TitleBar t={t} />

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

        <If when={error()}>
          <Text style={{ fontFamily: BODY, fontSize: 13, color: C.red, textAlign: "center", textShadow: "0 1px 2px #000" }}>{error()}</Text>
        </If>

        {/* Start */}
        <View style={{ alignItems: "center" }}>
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

function App() {
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
  return (
    <If when={running()} else={<Launcher onStart={start} />}>
      <View style={{ flex: 1 }}>
        <TitleBar t={t} solid onBack={back} />
        <View style={{ flex: 1 }}>
          <PobCanvas style={{ flex: 1 }} />
          <If when={!progress().loaded}>
            <Loading t={t} progress={progress} />
          </If>
        </View>
      </View>
    </If>
  );
}

mount(App);
