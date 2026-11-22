import { Image, mount, openUrl, Shader, signal, Text, View, type ViewStyle } from "nsh";
import { checkForUpdate, downloadUpdate, installAndRestart, installOnQuit, shellInfo, type AppUpdate } from "nsh/updater";
import { Pob, PobCanvas } from "pobt/native";
import Cinzel from "./assets/fonts/Cinzel-Bold.woff2";
import "./assets/fonts/Cinzel-SemiBold.woff2";
import darkLeft from "./assets/ui/dark-left.png";
import darkMiddle from "./assets/ui/dark-middle.png";
import darkRight from "./assets/ui/dark-right.png";
import brassLeft from "./assets/ui/brass-left.png";
import brassMiddle from "./assets/ui/brass-middle.png";
import brassRight from "./assets/ui/brass-right.png";
import redLeft from "./assets/ui/red-left.png";
import redMiddle from "./assets/ui/red-middle.png";
import redRight from "./assets/ui/red-right.png";
import rule from "./assets/ui/rule.png";
import title from "./assets/ui/title.png";
import pobtTitle from "./assets/ui/pobt.png";
import { GATE } from "./gate";
import icon from "./icon.png";
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
  start: string;
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
    start: "Start",
    needDir: "Choose the folder of Path of Building first",
    notPobDir: (dir, game) => `${dir} is not a Path of Building folder for ${game}`,
    downloading: (v, p) => `Downloading POBT ${v} … ${p}%`,
    ready: (v) => `POBT ${v} is ready and installs when you quit`,
    released: (v) => `POBT ${v} is out`,
    failed: (e) => `The update failed: ${e}`,
    restart: "Restart now",
    download: "Download",
  },
  "zh-rCN": {
    games: { Poe1: "流放之路", Poe2: "流放之路 2" },
    subtitle: "运行你的 Path of Building，界面换成你的语言",
    pobFolder: "PATH OF BUILDING",
    notFound: "未找到 Path of Building，请选择它的安装目录",
    pick: "选择目录…",
    start: "启动",
    needDir: "请先选择 Path of Building 的安装目录",
    notPobDir: (dir, game) => `${dir} 不是${game}的 Path of Building 目录`,
    downloading: (v, p) => `正在下载 POBT ${v} … ${p}%`,
    ready: (v) => `POBT ${v} 已下载，退出后自动更新`,
    released: (v) => `POBT ${v} 已发布`,
    failed: (e) => `更新失败：${e}`,
    restart: "立即重启",
    download: "下载",
  },
  "zh-rTW": {
    games: { Poe1: "流亡黯道", Poe2: "流亡黯道 2" },
    subtitle: "執行你的 Path of Building，介面換成你的語言",
    pobFolder: "PATH OF BUILDING",
    notFound: "找不到 Path of Building，請選擇它的安裝目錄",
    pick: "選擇目錄…",
    start: "啟動",
    needDir: "請先選擇 Path of Building 的安裝目錄",
    notPobDir: (dir, game) => `${dir} 不是${game}的 Path of Building 目錄`,
    downloading: (v, p) => `正在下載 POBT ${v} … ${p}%`,
    ready: (v) => `POBT ${v} 已下載，結束後自動更新`,
    released: (v) => `POBT ${v} 已發佈`,
    failed: (e) => `更新失敗：${e}`,
    restart: "立即重新啟動",
    download: "下載",
  },
  "ko-KR": {
    games: { Poe1: "패스 오브 엑자일", Poe2: "패스 오브 엑자일 2" },
    subtitle: "Path of Building을 당신의 언어로",
    pobFolder: "PATH OF BUILDING",
    notFound: "Path of Building을 찾을 수 없습니다. 폴더를 선택하세요",
    pick: "폴더 선택…",
    start: "시작",
    needDir: "먼저 Path of Building 폴더를 선택하세요",
    notPobDir: (dir, game) => `${dir}은(는) ${game}의 Path of Building 폴더가 아닙니다`,
    downloading: (v, p) => `POBT ${v} 다운로드 중 … ${p}%`,
    ready: (v) => `POBT ${v} 준비 완료, 종료 시 설치됩니다`,
    released: (v) => `POBT ${v} 출시`,
    failed: (e) => `업데이트 실패: ${e}`,
    restart: "지금 다시 시작",
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

// Buttons light up under the pointer and sink when pressed: pushed in, smaller and darker.
// Letters cut into brass: dark, with light catching their lower edge.
const ENGRAVED = "0 1px 0 rgba(255,236,190,0.45)";
const HOVER: ViewStyle = { filter: "brightness(1.18)" };
const PRESSED: ViewStyle = { filter: "brightness(0.62)", transform: [{ translateY: 3 }, { scale: 0.96 }] };

const PLAQUES = {
  red: { left: redLeft, middle: redMiddle, right: redRight },
  dark: { left: darkLeft, middle: darkMiddle, right: darkRight },
  brass: { left: brassLeft, middle: brassMiddle, right: brassRight },
};
type PlaqueKind = keyof typeof PLAQUES;

/** A plaque with pointed ends (art 64×96 caps), `height` tall, its content centred over it. */
function Plaque(props: { kind: () => PlaqueKind; height: number; children: any }) {
  const cap = (props.height * 64) / 96;
  const art = () => PLAQUES[props.kind()];
  return (
    <View style={{ height: props.height, flexDirection: "row" }}>
      <Image src={art().left} style={{ width: cap, height: props.height }} />
      <Image src={art().middle} style={{ flex: 1, height: props.height, objectFit: "fill" }} />
      <Image src={art().right} style={{ width: cap, height: props.height }} />
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
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
    <View role="button" onPress={props.onPress} style={{ width: 360 }} hoverStyle={HOVER} pressedStyle={PRESSED}>
      <Plaque kind={() => "red"} height={64}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: "700", letterSpacing: 6, color: "#f6e6c2" }}>{props.label}</Text>
      </Plaque>
    </View>
  );
}

/** A small brass button, as the site's store buttons. */
function Button(props: { label: string; onPress: () => void }) {
  return (
    <View role="button" onPress={props.onPress} style={{ minWidth: 150 }} hoverStyle={HOVER} pressedStyle={PRESSED}>
      <Plaque kind={() => "brass"} height={38}>
        <Text style={{ fontFamily: BODY, fontSize: 13, fontWeight: "700", color: C.ink, textShadow: ENGRAVED }}>{props.label}</Text>
      </Plaque>
    </View>
  );
}

/** A footer link, set in the display face as the game's menus are. */
function Link(props: { label: string; url: string }) {
  // Lights up under the pointer.
  const hover = signal(false);
  return (
    <View
      role="link"
      onPress={() => openUrl(props.url)}
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
          onPress={() => (state() === "ready" ? installAndRestart() : !u().canInstall ? openUrl(u().url) : undefined)}
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

function GameCard(props: { game: Game; settings: () => Settings; t: () => Strings; onSelect: () => void; onPick: () => void }) {
  const selected = () => props.settings().game === props.game;
  const dir = () => dirOf(props.settings(), props.game);
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
          paddingTop: 38,
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
        <Image src={rule} style={{ width: 260, height: 9, opacity: selected() ? 1 : 0.5 }} />
        <Text style={{ fontFamily: BODY, fontSize: 12, color: dir() ? C.muted : C.red, textAlign: "center", numberOfLines: 2 }}>
          {dir() ?? props.t().notFound}
        </Text>
        <Button label={props.t().pick} onPress={props.onPick} />
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

      {/* POBT at the top left; the version, and a newer one when there is, at the top right */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingTop: 16, height: 52 }}>
        <Image src={icon} style={{ width: 28, height: 28 }} />
        <Image src={pobtTitle} style={{ width: 84, height: 46 }} accessibilityLabel="POBT" />
        <View style={{ flex: 1 }} />
        <UpdateBadge t={t} />
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>v{shellInfo().version ?? "dev"}</Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 72, paddingBottom: 16, gap: 24, justifyContent: "center" }}>
        {/* Title */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Image src={title} style={{ width: 760, height: 104.5 }} accessibilityLabel="Path of Building" />
          <Image src={rule} style={{ width: 560, height: 19 }} />
          <Text style={{ fontFamily: BODY, fontSize: 14, color: C.text, textShadow: "0 0 3px #000, 0 0 8px #000, 0 0 14px #000, 0 1px 2px #000" }}>{t().subtitle}</Text>
        </View>

        {/* Games */}
        <View style={{ flexDirection: "row", gap: 28 }}>
          <Each of={GAMES}>
            {(g) => <GameCard game={g().id} settings={settings} t={t} onSelect={() => update({ game: g().id })} onPick={() => pick(g())} />}
          </Each>
        </View>

        {/* Language */}
        <View style={{ flexDirection: "row", alignSelf: "center", gap: 6 }}>
          <Each of={languages}>
            {(l) => {
              const selected = () => settings().language === l().value;
              return (
                <View role="button" onPress={() => chooseLanguage(l().value)} style={{ width: 132 }} hoverStyle={HOVER} pressedStyle={PRESSED}>
                  <Plaque kind={() => (selected() ? "brass" : "dark")} height={40}>
                    <Text style={{ fontFamily: BODY, fontSize: 14, fontWeight: selected() ? "700" : "400", color: selected() ? C.ink : C.gold, textShadow: selected() ? ENGRAVED : "0 1px 2px #000" }}>
                      {l().name}
                    </Text>
                  </Plaque>
                </View>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 32, paddingVertical: 14, backgroundColor: "rgba(0,0,0,0.45)" }}>
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

function App() {
  const running = signal(false);
  return (
    <If when={running()} else={<Launcher onStart={() => running.set(true)} />}>
      <PobCanvas />
    </If>
  );
}

mount(App);
