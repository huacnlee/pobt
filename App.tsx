import { mount, signal, Text, View } from "nsh";
import { Pob, PobCanvas } from "pobt/native";

type Game = "Poe1" | "Poe2";

interface Settings {
  poe1_dir: string | null;
  poe2_dir: string | null;
  game: Game;
  language: string | null;
}

interface Language {
  name: string;
  value: string;
}

const GAMES: { id: Game; key: string; label: string }[] = [
  { id: "Poe1", key: "poe1", label: "流放之路" },
  { id: "Poe2", key: "poe2", label: "流放之路 2" },
];

function dirOf(s: Settings, game: Game): string | null {
  return game === "Poe1" ? s.poe1_dir : s.poe2_dir;
}

function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.onPress}
      role="button"
      class={`rounded-md border px-3 py-1 ${props.selected ? "border-primary bg-accent" : "border-border bg-background"}`}
    >
      <Text class="text-sm text-foreground">{props.label}</Text>
    </View>
  );
}

function Launcher(props: { onStart: () => void }) {
  const settings = signal<Settings>(JSON.parse(Pob.settings()));
  const languages: Language[] = JSON.parse(Pob.languages());
  const error = signal("");

  const update = (change: Partial<Settings>) => settings.set({ ...settings(), ...change });

  const pick = async (game: (typeof GAMES)[number]) => {
    const dir = await Pob.pickDir();
    if (!dir) return;
    if (!Pob.isPobDir(dir, game.key)) {
      error.set(`${dir} 不是${game.label}的 Path of Building 目录`);
      return;
    }
    error.set("");
    update(game.id === "Poe1" ? { poe1_dir: dir, game: game.id } : { poe2_dir: dir, game: game.id });
  };

  const start = () => {
    const s = settings();
    const dir = dirOf(s, s.game);
    if (!dir) {
      error.set("请先选择 Path of Building 的安装目录");
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

  if (Pob.autostart()) queueMicrotask(start);

  return (
    <View class="flex-1 justify-center gap-6 bg-background p-8">
      <View class="gap-1">
        <Text class="text-3xl font-bold text-foreground">POBT</Text>
        <Text class="text-sm text-muted-foreground">Path of Building 多语言界面 · 翻译数据来自 PoeCharm2</Text>
      </View>

      <View class="flex-row gap-4">
        <Each of={GAMES}>
          {(g) => {
            const game = g();
            const selected = () => settings().game === game.id;
            return (
              <View
                onPress={() => update({ game: game.id })}
                class={`flex-1 gap-2 rounded-xl border p-4 ${selected() ? "border-primary bg-accent" : "border-border bg-card"}`}
              >
                <Text class="text-lg font-semibold text-foreground">{game.label}</Text>
                <Text class="text-xs text-muted-foreground">{dirOf(settings(), game.id) ?? "未找到 Path of Building"}</Text>
                <View onPress={() => pick(game)} role="button" class="self-start rounded-md border border-border px-3 py-1">
                  <Text class="text-sm text-foreground">选择目录…</Text>
                </View>
              </View>
            );
          }}
        </Each>
      </View>

      <View class="flex-row flex-wrap items-center gap-2">
        <Text class="text-sm text-foreground">语言</Text>
        <Each of={languages}>
          {(l) => <Chip label={l().name} selected={settings().language === l().value} onPress={() => update({ language: l().value })} />}
        </Each>
        <Chip label="English（不翻译）" selected={settings().language === null} onPress={() => update({ language: null })} />
      </View>

      <If when={error()}>
        <Text class="text-sm text-red-600">{error()}</Text>
      </If>

      <View onPress={start} role="button" class="self-start rounded-lg bg-primary px-6 py-3 active:opacity-80">
        <Text class="text-base text-primary-foreground">启动</Text>
      </View>
      <Text class="text-xs text-muted-foreground">运行中按 Ctrl+Shift+T 切换中文 / 英文</Text>
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
