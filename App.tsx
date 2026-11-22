import { Image, mount, openUrl, signal, Text, View } from "nsh";
import { checkForUpdate, downloadUpdate, installAndRestart, installOnQuit, shellInfo, type AppUpdate } from "nsh/updater";
import { Pob, PobCanvas } from "pobt/native";
import Cinzel from "./assets/fonts/Cinzel-Bold.woff2";
import "./assets/fonts/Cinzel-SemiBold.woff2";
import button from "./assets/ui/button.png";
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
const C = {
  bg: "#090807",
  panel: "rgba(255,255,255,0.025)",
  panelOn: "rgba(179,41,31,0.07)",
  line: "#2c2824",
  lineHi: "#4a423a",
  text: "#ece8e1",
  muted: "#9a948b",
  dim: "#67615a",
  red: "#b3291f",
  redHi: "#e04a3a",
};
const DISPLAY = `${Cinzel}, Microsoft YaHei, Malgun Gothic, serif`;
const BODY = "Microsoft YaHei, Malgun Gothic, Segoe UI, sans-serif";

function dirOf(s: Settings, game: Game): string | null {
  return game === "Poe1" ? s.poe1_dir : s.poe2_dir;
}

/** A thin rule fading out at both ends. */
function Rule(props: { width?: number; color?: string }) {
  const c = props.color ?? C.lineHi;
  return (
    <View
      style={{
        width: props.width,
        alignSelf: props.width ? "center" : "stretch",
        height: 1,
        backgroundImage: `linear-gradient(90deg, transparent, ${c}, transparent)`,
      }}
    />
  );
}

/** Path of Exile 2's red stone button. */
function PrimaryButton(props: { label: string; onPress: () => void }) {
  return (
    <View role="button" onPress={props.onPress} style={{ width: 280, height: 63 }} hoverStyle={{ opacity: 0.9 }} pressedStyle={{ opacity: 0.75 }}>
      <Image src={button} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, objectFit: "fill" }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: "700", letterSpacing: 6, color: "#fff4ee" }}>{props.label}</Text>
      </View>
    </View>
  );
}

/** A quiet outlined button. */
function Button(props: { label: string; onPress: () => void }) {
  return (
    <View
      role="button"
      onPress={props.onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.lineHi, backgroundColor: "rgba(0,0,0,0.4)" }}
      hoverStyle={{ borderColor: C.muted }}
      pressedStyle={{ opacity: 0.7 }}
    >
      <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text }}>{props.label}</Text>
    </View>
  );
}

/** A footer link, set in the display face as the game's menus are. */
function Link(props: { label: string; url: string }) {
  return (
    <View role="link" onPress={() => openUrl(props.url)} style={{ paddingVertical: 2 }} hoverStyle={{ opacity: 0.7 }}>
      <Text style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: "600", letterSpacing: 2, color: C.muted }}>{props.label.toUpperCase()}</Text>
    </View>
  );
}

function Dot() {
  return <View style={{ width: 4, height: 4, backgroundColor: C.dim, transform: [{ rotate: "45deg" }] }} />;
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
            borderColor: C.red,
            backgroundColor: "rgba(179,41,31,0.12)",
          }}
          hoverStyle={{ backgroundColor: "rgba(179,41,31,0.25)" }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.redHi }} />
          <Text style={{ fontFamily: BODY, fontSize: 12, color: C.text }}>{message(u())}</Text>
          <If when={state() === "ready"}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.redHi }}>{props.t().restart} ›</Text>
          </If>
        </View>
      )}
    </If>
  );
}

function GameCard(props: { game: Game; settings: () => Settings; t: () => Strings; onSelect: () => void; onPick: () => void }) {
  const selected = () => props.settings().game === props.game;
  const dir = () => dirOf(props.settings(), props.game);
  const english = () => UI.en.games[props.game];
  return (
    <View
      onPress={props.onSelect}
      style={{
        flex: 1,
        padding: 22,
        gap: 14,
        borderWidth: 1,
        borderColor: selected() ? C.red : C.line,
        backgroundColor: selected() ? C.panelOn : C.panel,
      }}
      hoverStyle={selected() ? undefined : { borderColor: C.lineHi }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 4, alignSelf: "stretch", backgroundColor: selected() ? C.redHi : C.lineHi }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: "700", color: C.text }}>{props.t().games[props.game]}</Text>
          <Text style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: 3, color: selected() ? C.redHi : C.dim }}>
            {english().toUpperCase()}
          </Text>
        </View>
      </View>
      <Rule />
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: 2, color: C.dim }}>{props.t().pobFolder}</Text>
        <Text style={{ fontFamily: BODY, fontSize: 12, color: dir() ? C.muted : C.redHi, numberOfLines: 2 }}>
          {dir() ?? props.t().notFound}
        </Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button label={props.t().pick} onPress={props.onPick} />
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
    <View style={{ flex: 1, backgroundColor: C.bg, backgroundImage: "radial-gradient(ellipse at 50% 35%, #1a1614 0%, #090807 70%)" }}>

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 32, paddingVertical: 16 }}>
        <Image src={icon} style={{ width: 30, height: 30 }} />
        <Text style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: "700", letterSpacing: 6, color: C.text }}>POBT</Text>
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>v{shellInfo().version ?? "dev"}</Text>
        <UpdateBadge t={t} />
      </View>
      <Rule />

      <View style={{ flex: 1, paddingHorizontal: 56, paddingVertical: 24, gap: 24, justifyContent: "center" }}>

        {/* Title */}
        <View style={{ alignItems: "center", gap: 10 }}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: "700", letterSpacing: 6, color: C.text }}>PATH OF BUILDING</Text>
          <Rule width={420} color={C.red} />
          <Text style={{ fontFamily: BODY, fontSize: 14, color: C.muted }}>{t().subtitle}</Text>
        </View>

        {/* Games */}
        <View style={{ flexDirection: "row", gap: 20 }}>
          <Each of={GAMES}>
            {(g) => (
              <GameCard game={g().id} settings={settings} t={t} onSelect={() => update({ game: g().id })} onPick={() => pick(g())} />
            )}
          </Each>
        </View>

        {/* Language */}
        <View style={{ flexDirection: "row", alignSelf: "center", borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(0,0,0,0.35)" }}>
          <Each of={languages}>
            {(l, i) => {
              const selected = () => settings().language === l().value;
              return (
                <View
                  role="button"
                  onPress={() => chooseLanguage(l().value)}
                  style={{
                    minWidth: 104,
                    alignItems: "center",
                    paddingHorizontal: 18,
                    paddingVertical: 8,
                    borderLeftWidth: i() === 0 ? 0 : 1,
                    borderColor: C.line,
                    backgroundColor: selected() ? C.red : "transparent",
                  }}
                  hoverStyle={selected() ? undefined : { backgroundColor: "rgba(255,255,255,0.05)" }}
                >
                  <Text style={{ fontFamily: BODY, fontSize: 14, color: selected() ? "#fff" : C.muted }}>{l().name}</Text>
                </View>
              );
            }}
          </Each>
        </View>

        <If when={error()}>
          <Text style={{ fontFamily: BODY, fontSize: 13, color: C.redHi, textAlign: "center" }}>{error()}</Text>
        </If>

        {/* Start */}
        <View style={{ alignItems: "center", gap: 10 }}>
          <PrimaryButton label={t().start} onPress={start} />
        </View>
      </View>

      {/* Footer */}
      <Rule />
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

function App() {
  const running = signal(false);
  return (
    <If when={running()} else={<Launcher onStart={() => running.set(true)} />}>
      <PobCanvas />
    </If>
  );
}

mount(App);
