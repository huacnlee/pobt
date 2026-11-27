// Making an item, as Path of Building's Items tab does: its "Craft item..." window (a rarity, a name, a type and a
// base) and its "Create custom..." window (the item's text), drawn from POB's own window and its controls (so every
// option is POB's, in POB's order), with POB's tooltip of the item it would make. What the window makes becomes POB's
// display item, shown here with POB's "Add to build" / "Save", "Edit..." and "Cancel".
import { resource, Scroll, signal, View } from "nsh";
import { Button, Checkbox, Modal, Select, Text, TextArea, Input } from "../../../ui";
import { plain } from "../../ColoredText";
import { tr } from "../../i18n";
import { build } from "../../session";
import {
  cancelPasted,
  type Display,
  openWindow,
  type PopupControl,
  popupClose,
  popupPress,
  popupSet,
  popupTip,
  rarityOf,
  readDisplay,
  saveDisplay,
} from "./data";
import { ItemTip } from "./ItemTip";
import { s } from "./strings";

export type WindowKind = "craft" | "custom";

/** Open while `request` is set: `{ what, n }`, `n` new for each opening. */
export function ItemWindow(props: { request: { what: WindowKind; n: number } | null; onClose: () => void; onSaved: (id: number) => void }) {
  const display = signal<Display | null>(null);
  const busy = signal(false);
  const error = signal("");

  // POB opens its window for each request
  const opened = resource(
    () => (props.request && build.open() ? props.request : null),
    async (req) => {
      error.set("");
      display.set(null);
      await openWindow(req.what);
      display.set(await readDisplay());
      return true;
    },
  );

  const popup = () => display()?.popup ?? null;
  const fields = () => (popup()?.controls ?? []).filter((c) => c.shown && c.kind !== "button");
  const buttons = () => (popup()?.controls ?? []).filter((c) => c.shown && c.kind === "button");

  // POB's tooltip of what the window would make: its list that has one (the base), else its button that has one
  // ("Create": the item, or why the text is not one); asked again after every change
  const preview = resource(
    () => {
      const p = popup();
      if (!p) return null;
      const list = p.controls.find((c) => c.tip && c.kind === "list" && c.shown);
      const button = p.controls.find((c) => c.tip && c.kind === "button" && c.shown);
      const pick = list ?? button;
      return pick ? { name: pick.name, index: pick.kind === "list" ? pick.sel : undefined, key: JSON.stringify(p.controls) } : null;
    },
    (src) => popupTip(src.name, src.index),
  );

  const run = async (work: () => Promise<unknown>) => {
    busy.set(true);
    error.set("");
    try {
      await work();
      display.set(await readDisplay());
    } catch (e) {
      error.set(String((e as Error).message ?? e));
    } finally {
      busy.set(false);
    }
  };

  const close = () => {
    void popupClose().then(() => cancelPasted());
    display.set(null);
    props.onClose();
  };

  const press = (c: PopupControl) => {
    if (c.name === "cancel" && !display()?.item) return close();
    void run(() => popupPress(c.name));
  };

  const save = async () => {
    busy.set(true);
    error.set("");
    try {
      const id = await saveDisplay();
      display.set(null);
      props.onSaved(id);
      props.onClose();
    } catch (e) {
      error.set(String((e as Error).message ?? e));
    } finally {
      busy.set(false);
    }
  };

  const title = () => (popup() ? tr(popup()!.title) : s("newItem"));

  return (
    <Modal
      open={!!props.request}
      onOpenChange={(open) => open || close()}
      title={title()}
      class="w-[620px]"
      footer={
        <If
          when={popup()}
          else={
            <>
              <Button variant="ghost" label={tr("Cancel")} onPress={close} />
              <Button variant="default" label={tr("Edit...")} disabled={busy() || !display()?.item} onPress={() => void run(() => openWindow("edit"))} />
              <Button variant="primary" label={tr(display()?.inBuild ? "Save" : "Add to build")} disabled={!display()?.item} busy={busy()} onPress={() => void save()} />
            </>
          }
        >
          <Each of={buttons()} key={(c) => c.name}>
            {(c) => (
              <Button
                variant={c().name === "cancel" ? "ghost" : "primary"}
                label={tr(c().label ?? c().name)}
                disabled={!c().enabled || busy()}
                busy={busy() && c().name !== "cancel"}
                onPress={() => press(c())}
              />
            )}
          </Each>
        </If>
      }
    >
      <If when={!opened.loading()} else={<Text tone="muted">{s("loading")}</Text>}>
        <If when={popup()}>
          <View class="gap-2">
            <Each of={fields()} key={(c) => c.name}>
              {(c) => <Field control={c()} onSet={(v) => void run(() => popupSet(c().name, v))} />}
            </Each>
          </View>
        </If>
        <Scroll class="max-h-[420px] shrink" contentClass="min-h-10">
          <If
            when={popup()}
            else={
              <If when={display()?.item && display()?.lines}>
                <ItemTip lines={display()?.lines ?? []} rarity={rarityOf(display()?.item?.rarity)} class="w-[400px] self-center" />
              </If>
            }
          >
            <If when={preview()?.lines.length}>
              <ItemTip lines={preview()?.lines ?? []} rarity="normal" class="w-[400px] self-center" />
            </If>
          </If>
        </Scroll>
      </If>
      <If when={error()}>
        <Text tone="destructive">{tr(error())}</Text>
      </If>
    </Modal>
  );
}

/** One control of POB's window: a drop-down, a text box (the item's text is many lines), a check box. */
function Field(props: { control: PopupControl; onSet: (v: number | string | boolean) => void }) {
  const c = () => props.control;
  const caption = () => tr((c().caption ?? "").replace(/[:：]\s*$/, "")) || tr(c().placeholder ?? c().name);
  // a text box keeps what is typed and tells POB a moment after the typing stops
  const draft = signal(props.control.text ?? "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const type = (v: string) => {
    draft.set(v);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => props.onSet(v), 250);
  };
  return (
    <View class="flex-row items-center gap-3">
      <If when={c().kind !== "edit" || c().name !== "edit"}>
        <Text variant="label" tone="muted" class="w-16">
          {caption()}
        </Text>
      </If>
      <If when={c().kind === "list"}>
        <Select
          class="flex-1"
          label={caption()}
          value={c().sel ? String(c().sel) : null}
          onChange={(v) => props.onSet(Number(v))}
          searchable={(c().items?.length ?? 0) > 12}
          options={(c().items ?? []).map((title, i) => ({ value: String(i + 1), title: tr(plain(title)) }))}
        />
      </If>
      <If when={c().kind === "edit" && c().name === "edit"}>
        <TextArea value={draft()} onChange={type} accessibilityLabel={s("itemText")} placeholder={s("itemText")} autoFocus class="h-56 flex-1 font-mono" />
      </If>
      <If when={c().kind === "edit" && c().name !== "edit"}>
        <Input value={draft()} onChange={type} accessibilityLabel={caption()} placeholder={tr(c().placeholder ?? "")} class="flex-1" />
      </If>
      <If when={c().kind === "check"}>
        <Checkbox hideLabel checked={!!c().checked} onChange={(on) => props.onSet(on)} label={caption()} />
      </If>
    </View>
  );
}
