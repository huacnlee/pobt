// The Notes page of POBT's build editor: the notes of Path of Building's notes tab (service/notes.lua), in POB's
// colours (`^7`, `^xRRGGBB`), and the same text to edit, written back to POB's notes as typing stops.
import { cleanup, effect, resource, Scroll, signal, untracked, View } from "nsh";
import { EmptyState, Segmented, TextArea } from "../../ui";
import { ColoredText } from "../ColoredText";
import { page } from "../BuildEditor";
import { language, t } from "../i18n";
import { build, pob, reload } from "../session";

type Mode = "view" | "edit";

export function NotesPage() {
  const mode = signal<Mode>("view");
  const draft = signal("");
  const failure = signal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = 0;

  const notes = resource(
    // read while the page shows: POB recalculates on every change elsewhere too
    () => page() === "notes" && build.open() && build.revision() + 1,
    async () => (await pob<{ text: string }>("notes.read")).text,
  );

  const save = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const text = draft();
    if (text === (notes() ?? "")) return;
    saving++;
    try {
      failure.set("");
      await pob("notes.write", { text });
      notes.mutate(text);
      // the sidebar's summary says the build is now unsaved
      await reload();
    } catch (e) {
      failure.set(String((e as Error).message ?? e));
    } finally {
      saving--;
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), 600);
  };

  // POB's notes, while nothing typed here is waiting to be written (another build opened, a write read back)
  effect(() => {
    const text = notes() ?? "";
    if (!timer && saving === 0) untracked(() => draft.set(text));
  });
  cleanup(() => {
    if (timer) void save();
  });

  const lines = () => draft().split(/\r?\n/).map((line, i) => ({ i, line }));

  return (
    <If when={build.open()} else={<EmptyState title={t("noBuild")} />}>
      <View class="flex-1">
        <View class="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Segmented<Mode>
            items={[
              { key: "view", label: s("view") },
              { key: "edit", label: s("edit") },
            ]}
            value={mode()}
            onChange={(m) => {
              if (m === "view" && timer) void save();
              mode.set(m);
            }}
            accessibilityLabel={s("mode")}
          />
          <View class="flex-1" />
          <If when={failure()}>
            <ColoredText raw text={failure()} class="text-destructive" />
          </If>
        </View>
        <If
          when={mode() === "edit"}
          else={
            <If when={draft().trim()} else={<EmptyState title={t("noNotes")} />}>
              <Scroll class="flex-1" contentClass="p-4">
                <Each of={lines()} key={(l) => l.i}>
                  {(l) => <ColoredText raw text={l().line || " "} class="select-text" />}
                </Each>
              </Scroll>
            </If>
          }
        >
          <View class="flex-1 p-4">
            <TextArea
              value={draft()}
              onChange={(v) => {
                draft.set(v);
                schedule();
              }}
              placeholder={s("placeholder")}
              accessibilityLabel={s("mode")}
              autoFocus
              class="flex-1 font-mono"
            />
          </View>
        </If>
      </View>
    </If>
  );
}

// What only this page says.
const STRINGS = {
  en: { view: "View", edit: "Edit", mode: "Notes", placeholder: "Notes for this build. ^xRRGGBB or ^1–^9 change the colour." },
  "zh-rCN": { view: "查看", edit: "编辑", mode: "备注", placeholder: "这个构建的备注。^xRRGGBB 或 ^1–^9 可改变颜色。" },
  "zh-rTW": { view: "檢視", edit: "編輯", mode: "備註", placeholder: "這個配置的備註。^xRRGGBB 或 ^1–^9 可改變顏色。" },
  "ko-KR": { view: "보기", edit: "편집", mode: "메모", placeholder: "이 빌드의 메모. ^xRRGGBB 또는 ^1–^9로 색을 바꿉니다." },
} as const;

function s(key: keyof (typeof STRINGS)["en"]): string {
  const lang = language();
  return (lang && STRINGS[lang as keyof typeof STRINGS]?.[key]) || STRINGS.en[key];
}
