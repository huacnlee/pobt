// The Items page of POBT's build editor: Path of Building's Items tab in POBT's own layout. The item set in use, the
// slots POB shows (equipment, flasks, the tree's jewel sockets) and every item of the build; the chosen one drawn as
// POB's tooltip (stat comparisons included). Equipping, flasks and sets go through POB's own controls.
import { resource, Scroll, signal, View } from "nsh";
import { Badge, Button, EmptyState, FADE, ListRow, Panel, ProgressBar, Segmented, Select, Checkbox, Text } from "../../ui";
import { GameArt } from "../art";
import { plain } from "../ColoredText";
import { tr } from "../i18n";
import { build } from "../session";
import { equip, equipItem, type ItemInfo, type ItemsData, rarityOf, readItems, setActiveSet, setFlask, setWeaponSet, type SlotInfo, type TipLine, tooltipOf } from "./items/data";
import { ItemHover } from "./items/ItemHover";
import { ItemTip, RARITY_TEXT } from "./items/ItemTip";
import { PasteItem } from "./items/PasteItem";
import { s } from "./items/strings";

type Selection = { slot: string } | { item: number } | null;

/** A slot's name as POB labels it; an abyssal socket under the item that has it. */
const slotLabel = (x: SlotInfo) => (x.parent ? `${tr(x.parent)} ${tr(x.label)}` : tr(x.label));

export function ItemsPage() {
  const selection = signal<Selection>(null);
  const pasting = signal(false);

  // read again after every recalculation
  const data = resource(
    () => build.open() && build.revision() + 1,
    () => readItems(),
  );
  const d = () => data();
  const itemOf = (id: number): ItemInfo | undefined => (id > 0 ? d()?.items.find((i) => i.id === id) : undefined);
  const slotOf = (name: string) => d()?.slots.find((x) => x.name === name);
  const selected = (): { item?: ItemInfo; slot?: SlotInfo } => {
    const sel = selection();
    if (!sel) return {};
    if ("slot" in sel) {
      const slot = slotOf(sel.slot);
      return { slot, item: slot ? itemOf(slot.itemId) : undefined };
    }
    return { item: itemOf(sel.item) };
  };
  const equippedIn = (id: number) => (d()?.slots ?? []).filter((x) => x.itemId === id);
  const isSelected = (sel: Selection) => {
    const cur = selection();
    if (!cur || !sel) return false;
    return "slot" in sel ? "slot" in cur && cur.slot === sel.slot : "item" in cur && cur.item === sel.item;
  };
  const selectionKey = () => {
    const sel = selection();
    return !sel ? "none" : "slot" in sel ? `slot:${sel.slot}` : `item:${sel.item}`;
  };

  // the item pointed at or focused in a slot's list: POB's tooltip compares it with that slot, as hovering an item of
  // POB's slot drop-down does
  // (kept with the choice it was made under, so a new choice starts from its own item)
  const preview = signal<{ key: string; id: number } | null>(null);
  const shownItem = () => {
    const { item, slot } = selected();
    const p = preview();
    return slot && p && p.key === selectionKey() && p.id > 0 ? itemOf(p.id) : item;
  };

  // POB's tooltip of what is chosen, again after each recalculation (its stat comparisons change with the build)
  const tip = resource(
    () => {
      const item = shownItem();
      const { slot } = selected();
      return item && build.revision() >= 0 ? { id: item.id, slot: slot?.name, rev: build.revision() } : null;
    },
    (src) => tooltipOf(src.id, src.slot),
  );

  const gear = () => (d()?.slots ?? []).filter((x) => !x.flask && !x.jewel);
  const flasks = () => (d()?.slots ?? []).filter((x) => x.flask);
  const jewels = () => (d()?.slots ?? []).filter((x) => x.jewel);

  return (
    <View class="flex-1">
      <If when={build.open()} else={<EmptyState title={s("loading")} />}>
        <View class="h-12 flex-row items-center gap-3 border-b border-border px-4">
          <Text variant="label" tone="muted">
            {tr("Item set:")}
          </Text>
          <Select
            class="w-60"
            accessibilityLabel={s("itemSet")}
            value={d()?.sets.sel ? String(d()!.sets.sel) : null}
            onChange={(v) => void setActiveSet(Number(v))}
            items={(d()?.sets.items ?? []).map((title, i) => ({ value: String(i + 1), title: tr(title) }))}
          />
          <Text variant="label" tone="muted">
            {tr("Weapon Set:")}
          </Text>
          <Segmented
            accessibilityLabel={s("weaponSet")}
            value={d()?.weaponSet === 2 ? "2" : "1"}
            onChange={(k) => void setWeaponSet(k === "2" ? 2 : 1)}
            items={[
              { key: "1", label: "I" },
              { key: "2", label: "II" },
            ]}
          />
          <View class="flex-1" />
          <If when={build.busy() || data.loading()}>
            <ProgressBar value={null} class="w-24" />
          </If>
          <Button variant="secondary" size="md" label={s("paste")} onPress={() => pasting.set(true)} />
        </View>
        <If when={data.error()}>
          <View class="border-b border-border bg-destructive/10 px-4 py-2">
            <Text tone="destructive">{`${s("failed")}: ${String(data.error())}`}</Text>
          </View>
        </If>
        <If when={d()} else={<EmptyState title={data.error() ? s("failed") : s("loading")} />}>
          <View class="flex-1 flex-row">
            <Scroll class="flex-1" contentClass="gap-3 p-4">
              <Panel title={tr("Equipped items:").replace(/[:：]\s*$/, "")}>
                <View class="p-1">
                  <Each of={gear()} key={(x) => x.name}>
                    {(row) => (
                      <SlotRow
                        row={row()}
                        item={itemOf(row().itemId)}
                        selected={isSelected({ slot: row().name })}
                        onPress={() => selection.set({ slot: row().name })}
                      />
                    )}
                  </Each>
                </View>
              </Panel>
              <If when={flasks().length}>
                <Panel title={s("flasks")}>
                  <View class="p-1">
                    <Each of={flasks()} key={(x) => x.name}>
                      {(row) => (
                        <View class="flex-row items-center gap-1">
                          <View class="w-8 items-center">
                            <If when={row().itemId > 0}>
                              <Checkbox
                                checked={row().active}
                                disabled={build.busy()}
                                accessibilityLabel={`${slotLabel(row())} ${s("active")}`}
                                onChange={(on) => void setFlask(row().name, on)}
                              />
                            </If>
                          </View>
                          <SlotRow
                            row={row()}
                            item={itemOf(row().itemId)}
                            selected={isSelected({ slot: row().name })}
                            onPress={() => selection.set({ slot: row().name })}
                            class="flex-1"
                          />
                        </View>
                      )}
                    </Each>
                  </View>
                </Panel>
              </If>
              <If when={jewels().length}>
                <Panel title={s("jewels")}>
                  <View class="p-1">
                    <Each of={jewels()} key={(x) => x.name}>
                      {(row) => (
                        <SlotRow
                          row={row()}
                          item={itemOf(row().itemId)}
                          selected={isSelected({ slot: row().name })}
                          onPress={() => selection.set({ slot: row().name })}
                        />
                      )}
                    </Each>
                  </View>
                </Panel>
              </If>
              <Panel title={`${s("allItems")} (${d()!.items.length})`}>
                <View class="p-1">
                  <If when={d()!.items.length} else={<Text tone="muted" class="p-2">{s("noItems")}</Text>}>
                    <Each of={d()!.items} key={(i) => i.id}>
                      {(it) => (
                        <ItemRow
                          item={it()}
                          equipped={equippedIn(it().id).length > 0}
                          selected={isSelected({ item: it().id })}
                          onPress={() => selection.set({ item: it().id })}
                        />
                      )}
                    </Each>
                  </If>
                </View>
              </Panel>
            </Scroll>
            <Scroll class="w-[380px] border-l border-border" contentClass="gap-3 p-4">
              {/* a new choice builds its view again, so it fades in */}
              <Each of={[selectionKey()]} key={(k) => k}>
                {() => (
                  <Detail
                    data={d()!}
                    item={selected().item}
                    slot={selected().slot}
                    shown={shownItem()}
                    onPreview={(id) => preview.set(id === null ? null : { key: selectionKey(), id })}
                    itemOf={itemOf}
                    lines={tip()?.lines}
                    equippedIn={selected().item ? equippedIn(selected().item!.id) : []}
                  />
                )}
              </Each>
            </Scroll>
          </View>
        </If>
        <PasteItem open={pasting()} onClose={() => pasting.set(false)} onAdded={(id) => selection.set({ item: id })} />
      </If>
    </View>
  );
}

/** An item's picture in a box of fixed size, so a row keeps its height before the picture arrives (or when it has
 * none). Uniques (and relics) by their name, the rest by their base. */
function ItemArt(props: { item?: ItemInfo; size: number; class?: string }) {
  return (
    <View class={`shrink-0 items-center justify-center ${props.class ?? ""}`} style={{ width: props.size, height: props.size }}>
      <If when={props.item}>
        {(it) => (
          <GameArt
            name={it().title ?? it().name}
            base={it().base}
            unique={rarityOf(it().rarity) === "unique"}
            size={props.size}
          />
        )}
      </If>
    </View>
  );
}

/** A slot: its name, then its item's in its rarity's colour. */
function SlotRow(props: { row: SlotInfo; item?: ItemInfo; selected: boolean; onPress: () => void; class?: string }) {
  return (
    <ItemHover class={props.class} id={props.item?.id} rarity={rarityOf(props.item?.rarity)} slot={props.row.name}>
      <ListRow
        selected={props.selected}
        onPress={props.onPress}
        accessibilityLabel={`${slotLabel(props.row)}: ${props.item ? tr(props.item.name) : s("empty")}`}
      >
        <ItemArt item={props.item} size={36} />
        <Text variant="caption" tone="muted" class="w-28 truncate">
          {slotLabel(props.row)}
        </Text>
        <If when={props.item} else={<Text tone="muted" class="flex-1">{s("empty")}</Text>}>
          {(it) => <Text class={`flex-1 truncate ${RARITY_TEXT[rarityOf(it().rarity)]}`}>{tr(it().name)}</Text>}
        </If>
      </ListRow>
    </ItemHover>
  );
}

/** An item of the build's list: its name in its rarity's colour, and its base. */
function ItemRow(props: { item: ItemInfo; equipped: boolean; selected: boolean; onPress: () => void }) {
  return (
    <ItemHover id={props.item.id} rarity={rarityOf(props.item.rarity)}>
      <ListRow selected={props.selected} onPress={props.onPress} accessibilityLabel={tr(props.item.name)}>
        <ItemArt item={props.item} size={36} />
        <View class="flex-1 flex-row items-center gap-2">
          <Text class={`shrink truncate ${RARITY_TEXT[rarityOf(props.item.rarity)]}`}>{tr(props.item.title ?? props.item.name)}</Text>
          <If when={props.item.title && props.item.base}>
            <Text variant="caption" tone="muted" class="flex-1 truncate">
              {tr(props.item.base)}
            </Text>
          </If>
        </View>
        <If when={props.equipped}>
          <Badge label={s("equipped")} tone="primary" />
        </If>
      </ListRow>
    </ItemHover>
  );
}

/** The chosen slot or item. A slot: POB's drop-down of it, its flask check box, and the items it takes, each compared
 * with it in POB's tooltip when pointed at or focused (as hovering POB's drop-down does). An item: where it is, POB's
 * "equip" (EquipItemInSet) and the slots that take it. Below, the item as POB's tooltip draws it. */
function Detail(props: {
  data: ItemsData;
  item?: ItemInfo;
  slot?: SlotInfo;
  shown?: ItemInfo;
  onPreview: (id: number | null) => void;
  itemOf: (id: number) => ItemInfo | undefined;
  lines?: TipLine[];
  equippedIn: SlotInfo[];
}) {
  // built anew for each choice: it starts clear and fades in on the next frame
  const visible = signal(false);
  requestAnimationFrame(() => visible.set(true));

  // POB's drop-down of the slot: "None", then the items it takes
  const slotChoices = (slot: SlotInfo) =>
    (slot.choices ?? []).map((name, i) => ({ value: String(slot.ids?.[i] ?? 0), title: i === 0 ? s("empty") : tr(plain(name)) }));
  // the items of the slot's drop-down, "None" left out
  const candidates = (slot: SlotInfo) => (slot.ids ?? []).filter((id) => id > 0).map((id) => props.itemOf(id)).filter((x): x is ItemInfo => !!x);
  // the shown slots whose drop-down offers this item
  const fitting = () => {
    const it = props.item;
    if (!it) return [];
    return props.data.slots.filter((x) => x.itemId !== it.id && (x.ids ?? []).includes(it.id)).map((x) => ({ value: x.name, title: slotLabel(x) }));
  };
  // POB's double-click puts it in its primary slot: offered unless it is there already
  const canEquip = () => {
    const it = props.item;
    if (!it?.equipSlot) return false;
    return props.data.slots.find((x) => x.name === it.equipSlot)?.itemId !== it.id;
  };

  return (
    <View class={`gap-3 ${FADE}`} classList={{ "opacity-0": !visible() }}>
      <If when={props.item || props.slot} else={<Text tone="muted" class="pt-8 text-center">{s("pick")}</Text>}>
        <If when={props.slot}>
          {(slot) => (
            <View class="gap-2">
              <Text variant="heading">{slotLabel(slot())}</Text>
              <Select
                accessibilityLabel={s("inSlot")}
                value={String(slot().itemId || 0)}
                onChange={(v) => void equip(slot(), Number(v))}
                items={slotChoices(slot())}
                searchable={(slot().choices?.length ?? 0) > 8}
                triggerContent={
                  <If when={props.itemOf(slot().itemId)} else={<Text tone="muted" class="text-sm">{s("empty")}</Text>}>
                    {(cur) => <Text class={`text-sm truncate ${RARITY_TEXT[rarityOf(cur().rarity)]}`}>{tr(cur().name)}</Text>}
                  </If>
                }
                renderItem={(e) => <SlotChoice slot={slot().name} item={props.itemOf(Number(e.value))} title={e.title} />}
              />
              <If when={slot().flask && slot().itemId > 0}>
                <View class="flex-row items-center gap-2">
                  <Checkbox checked={slot().active} disabled={build.busy()} accessibilityLabel={s("flaskActive")} onChange={(on) => void setFlask(slot().name, on)} />
                  <Text>{s("flaskActive")}</Text>
                </View>
              </If>
              <If when={candidates(slot()).length}>
                <View class="gap-1 pt-1">
                  <Text variant="label" tone="muted">
                    {s("candidates")}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {s("compareHint")}
                  </Text>
                  <View class="gap-0.5" onMouseLeave={() => props.onPreview(null)}>
                    <Each of={candidates(slot())} key={(it) => it.id}>
                      {(it) => (
                        <View
                          onMouseEnter={() => props.onPreview(it().id)}
                          onFocusIn={() => props.onPreview(it().id)}
                        >
                          <ItemHover id={it().id} rarity={rarityOf(it().rarity)} slot={slot().name}>
                            <ListRow
                              selected={slot().itemId === it().id}
                              onPress={() => void equip(slot(), it().id)}
                              accessibilityLabel={tr(it().name)}
                              accessibilityHint={s("compareHint")}
                            >
                              <ItemArt item={it()} size={36} />
                              <Text class={`flex-1 truncate ${RARITY_TEXT[rarityOf(it().rarity)]}`}>{tr(it().name)}</Text>
                              <If when={slot().itemId === it().id}>
                                <Badge label={s("equipped")} tone="primary" />
                              </If>
                            </ListRow>
                          </ItemHover>
                        </View>
                      )}
                    </Each>
                  </View>
                </View>
              </If>
            </View>
          )}
        </If>
        <If when={props.slot ? undefined : props.item}>
          {(it) => (
            <View class="gap-2">
              <Text variant="caption" tone="muted">
                {props.equippedIn.length ? `${s("equippedIn")}: ${props.equippedIn.map(slotLabel).join(", ")}` : s("notEquipped")}
              </Text>
              <View class="flex-row items-center gap-2">
                <If when={canEquip()}>
                  <Button variant="primary" size="md" label={s("equip")} disabled={build.busy()} onPress={() => void equipItem(it().id)} />
                </If>
                <If when={fitting().length}>
                  <Select
                    class="flex-1"
                    accessibilityLabel={s("equipIn")}
                    placeholder={s("equipIn")}
                    value={null}
                    onChange={(name) => {
                      const slot = props.data.slots.find((x) => x.name === name);
                      if (slot) void equip(slot, it().id);
                    }}
                    items={fitting()}
                  />
                </If>
              </View>
            </View>
          )}
        </If>
        <If when={props.shown}>
          {(it) => (
            <View class="gap-3">
              <GameArt
                name={it().title ?? it().name}
                base={it().base}
                unique={rarityOf(it().rarity) === "unique"}
                size={141}
                cell={47}
                class="self-center"
              />
              <If when={props.lines} else={<Text tone="muted">{s("reading")}</Text>}>
                <ItemTip lines={props.lines ?? []} rarity={rarityOf(it().rarity)} />
              </If>
            </View>
          )}
        </If>
      </If>
    </View>
  );
}

/** An item of a slot's drop-down: its picture and name in its rarity's colour; pointed at, POB's tooltip of it for the
 * slot, its stat comparison included (what hovering POB's drop-down shows). */
function SlotChoice(props: { slot: string; item?: ItemInfo; title: string }) {
  return (
    <If when={props.item} else={<Text class="text-sm" tone="muted">{props.title}</Text>}>
      {(it) => (
        <ItemHover class="flex-1" id={it().id} rarity={rarityOf(it().rarity)} slot={props.slot}>
          <View class="flex-row items-center gap-2">
            <ItemArt item={it()} size={28} />
            <Text class={`flex-1 text-sm truncate ${RARITY_TEXT[rarityOf(it().rarity)]}`}>{props.title}</Text>
          </View>
        </ItemHover>
      )}
    </If>
  );
}
