// "Paste an item", as Path of Building's Items tab takes one (ItemsTab:CreateDisplayItemFromRaw, normalised): POB reads
// the text as it is typed and shows its tooltip, with what equipping it would give; it is saved as POB's "Save" does
// (AddDisplayItem, into a free slot it fits), or equipped in a chosen slot as dropping it there does.
import { resource, Scroll, signal, View } from "nsh";
import { Button, Modal, Select, Text, TextArea } from "../../../ui";
import { tr } from "../../i18n";
import { build } from "../../session";
import { addPasted, cancelPasted, type Parsed, parsePasted, rarityOf } from "./data";
import { ItemTip } from "./ItemTip";
import { s } from "./strings";

const NO_SLOT = "";

export function PasteItem(props: { open: boolean; onClose: () => void; onAdded: (id: number) => void }) {
  const text = signal("");
  const slot = signal(NO_SLOT);
  const busy = signal(false);
  const error = signal("");

  // POB's reading of what is pasted, a moment after the typing stops; only the latest counts
  const parsed = resource(
    () => {
      const t = text().trim();
      return build.open() && t ? t : null;
    },
    async (t, info) => {
      await new Promise((r) => setTimeout(r, 250));
      if (info.signal.aborted) return undefined;
      return parsePasted(t).catch((e: Error): Parsed => ({ error: String(e.message ?? e) }));
    },
  );
  const item = () => parsed()?.item;
  const fits = () => parsed()?.fits ?? [];
  const chosen = () => (slot() && fits().some((f) => f.name === slot()) ? slot() : NO_SLOT);

  const close = () => {
    text.set("");
    slot.set(NO_SLOT);
    error.set("");
    void cancelPasted();
    props.onClose();
  };

  const save = async () => {
    if (!item()) return;
    busy.set(true);
    error.set("");
    try {
      const id = await addPasted(chosen() || undefined);
      text.set("");
      slot.set(NO_SLOT);
      props.onAdded(id);
      props.onClose();
    } catch (e) {
      error.set(String((e as Error).message ?? e));
    } finally {
      busy.set(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => open || close()}
      title={s("pasteTitle")}
      class="w-[600px]"
      footer={
        <>
          <Button variant="ghost" label={s("cancel")} onPress={close} />
          <Button variant="primary" label={chosen() ? s("addEquip") : s("add")} disabled={!item() || parsed.loading()} busy={busy()} onPress={() => void save()} />
        </>
      }
    >
      <Text tone="muted">{s("pasteHint")}</Text>
      <TextArea value={text()} onChange={(v) => text.set(v)} accessibilityLabel={s("itemText")} placeholder={s("itemText")} autoFocus class="h-36 font-mono" />
      <If when={fits().length}>
        <View class="flex-row items-center gap-3">
          <Text>{s("equipIn")}</Text>
          <Select
            class="w-56"
            label={s("equipIn")}
            value={chosen()}
            onChange={(v) => slot.set(v)}
            options={[{ value: NO_SLOT, title: s("dontEquip") }, ...fits().map((f) => ({ value: f.name, title: tr(f.label) }))]}
          />
        </View>
      </If>
      <Scroll class="max-h-96 shrink" contentClass="min-h-10">
        <If when={parsed.loading() && !item()}>
          <Text tone="muted">{s("reading")}</Text>
        </If>
        <If when={parsed()?.error && text().trim()}>
          <Text tone="destructive">{tr(parsed()?.error)}</Text>
        </If>
        <If when={item() && parsed()?.lines}>
          <ItemTip lines={parsed()?.lines ?? []} rarity={rarityOf(item()?.rarity)} class="w-[400px] self-center" />
        </If>
      </Scroll>
      <If when={error()}>
        <Text tone="destructive">{error()}</Text>
      </If>
    </Modal>
  );
}
