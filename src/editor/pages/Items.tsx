// The Items page of POBT's build editor: Path of Building's Items tab in POBT's own layout. The item set in use, the
// slots POB shows (equipment, flasks, the tree's jewel sockets) and every item of the build; the chosen one drawn as
// POB's tooltip (stat comparisons included). Equipping, flasks and sets go through POB's own controls.
import { resource, Scroll, signal, View } from "nsh";
import { Badge, Button, Empty, FADE, Row, Card, ProgressBar, Segmented, Select, Checkbox, Text } from "../../ui";
import { GameArt } from "../art";
import { plain } from "../ColoredText";
import { tr } from "../i18n";
import { build } from "../session";
import { equip, equipItem, type ItemInfo, type ItemsData, rarityOf, readItems, setActiveSet, setFlask, setWeaponSet, type SlotInfo, type TipLine, tooltipOf } from "./items/data";
import { ItemHover } from "./items/ItemHover";
import { ItemTip, RARITY_TEXT } from "./items/ItemTip";
import { ItemWindow, type WindowKind } from "./items/ItemWindow";
import { PasteItem } from "./items/PasteItem";
import { s } from "./items/strings";

type Selection = { slot: string } | { item: number } | null;

/** A slot's name as POB labels it; an abyssal socket under the item that has it. */
const slotLabel = (x: SlotInfo) => (x.parent ? `${tr(x.parent)} ${tr(x.label)}` : tr(x.label));

export function ItemsPage() {
  const selection = signal<Selection>(null);
  const pasting = signal(false);
  // POB's "Craft item..." / "Create custom..." window, asked for anew each press
  const making = signal<{ what: WindowKind; n: number } | null>(null);
  let makes = 0;

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
  // The slots, all items and the detail side by side once there is room for all three (the slots keep 520 wide)
  const width = signal(0);
  const wide = () => width() >= 1180;
  const allItems = () => (
    <Card bodyClass="" title={`${s("allItems")} (${d()!.items.length})`}>
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
    </Card>
  );
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
      <If when={build.open()} else={<Empty class="flex-1" title={s("loading")} />}>
        <View class="h-12 flex-row items-center gap-3 border-b border-border px-4">
          <Text variant="label" tone="muted">
            {tr("Item set:")}
          </Text>
          <Select
            class="w-60"
            label={s("itemSet")}
            value={d()?.sets.sel ? String(d()!.sets.sel) : null}
            onChange={(v) => void setActiveSet(Number(v))}
            options={(d()?.sets.items ?? []).map((title, i) => ({ value: String(i + 1), title: tr(title) }))}
          />
          <Text variant="label" tone="muted">
            {tr("Weapon Set:")}
          </Text>
          <Segmented
            label={s("weaponSet")}
            value={d()?.weaponSet === 2 ? "2" : "1"}
            onChange={(k) => void setWeaponSet(k === "2" ? 2 : 1)}
            items={[
              { value: "1", label: "I" },
              { value: "2", label: "II" },
            ]}
          />
          <View class="flex-1" />
          <If when={build.busy() || data.loading()}>
            <ProgressBar value={null} class="w-24" />
          </If>
          <Button variant="default" size="md" label={tr("Craft item...")} onPress={() => making.set({ what: "craft", n: ++makes })} />
          <Button variant="default" size="md" label={tr("Create custom...")} onPress={() => making.set({ what: "custom", n: ++makes })} />
          <Button variant="default" size="md" label={s("paste")} onPress={() => pasting.set(true)} />
        </View>
        <If when={data.error()}>
          <View class="border-b border-border bg-destructive/10 px-4 py-2">
            <Text tone="destructive">{`${s("failed")}: ${String(data.error())}`}</Text>
          </View>
        </If>
        <If when={d()} else={<Empty class="flex-1" title={data.error() ? s("failed") : s("loading")} />}>
          <View class="flex-1 flex-row" onLayout={(e) => width.set(e.bounds.size.width)}>
            {/* the slots, the build's items beside them (under them when there is no room), and what is chosen */}
            <Scroll class={wide() ? "w-[520px] shrink-0" : "flex-1"} contentClass="gap-3 p-4">
              <Card bodyClass="" title={tr("Equipped items:").replace(/[:：]\s*$/, "")}>
                <View class="p-1">
                  <Each of={gear()} key={(x) => x.name}>
                    {(row) => (
                      <SlotRow
                        row={row()}
                        item={itemOf(row().itemId)}
                        itemOf={itemOf}
                        selected={isSelected({ slot: row().name })}
                        onPress={() => selection.set({ slot: row().name })}
                      />
                    )}
                  </Each>
                </View>
              </Card>
              <If when={flasks().length}>
                {/* PoE2 has charms in this row too ("Charm 1") */}
                <Card bodyClass="" title={flasks().some((x) => /^Charm /.test(x.name)) ? s("flasksCharms") : s("flasks")}>
                  <View class="p-1">
                    <Each of={flasks()} key={(x) => x.name}>
                      {(row) => (
                        <View class="flex-row items-center gap-2">
                          <SlotRow
                            row={row()}
                            item={itemOf(row().itemId)}
                            itemOf={itemOf}
                            selected={isSelected({ slot: row().name })}
                            onPress={() => selection.set({ slot: row().name })}
                            class="flex-1"
                          />
                          {/* after the drop-down, so the flasks' names and drop-downs line up with the other slots' */}
                          <View class="w-6 items-center">
                            <If when={row().itemId > 0}>
                              <Checkbox
                                hideLabel
                                checked={row().active}
                                disabled={build.busy()}
                                label={`${slotLabel(row())} ${s("active")}`}
                                onChange={(on) => void setFlask(row().name, on)}
                              />
                            </If>
                          </View>
                        </View>
                      )}
                    </Each>
                  </View>
                </Card>
              </If>
              <If when={jewels().length}>
                <Card bodyClass="" title={s("jewels")}>
                  <View class="p-1">
                    <Each of={jewels()} key={(x) => x.name}>
                      {(row) => (
                        <SlotRow
                          row={row()}
                          item={itemOf(row().itemId)}
                          itemOf={itemOf}
                          selected={isSelected({ slot: row().name })}
                          onPress={() => selection.set({ slot: row().name })}
                        />
                      )}
                    </Each>
                  </View>
                </Card>
              </If>
              <If when={!wide()}>{allItems()}</If>
            </Scroll>
            <If when={wide()}>
              <Scroll class="min-w-[280px] flex-1 border-l border-border" contentClass="gap-3 p-4">
                {allItems()}
              </Scroll>
            </If>
            <Scroll class="w-[380px] shrink-0 border-l border-border" contentClass="gap-3 p-4">
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
        <ItemWindow request={making()} onClose={() => making.set(null)} onSaved={(id) => selection.set({ item: id })} />
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

/** POB's drop-down of a slot (ItemSlotControl): "None", then the items it takes, in their rarity's colour with their
 * picture; choosing one goes through POB's own control. Pointed at, an item shows POB's tooltip for the slot. */
function SlotSelect(props: { slot: SlotInfo; itemOf: (id: number) => ItemInfo | undefined; label: string; class?: string }) {
  const choices = () =>
    (props.slot.choices ?? []).map((name, i) => ({ value: String(props.slot.ids?.[i] ?? 0), title: i === 0 ? s("empty") : tr(plain(name)) }));
  return (
    <Select
      class={props.class}
      label={props.label}
      value={String(props.slot.itemId || 0)}
      onChange={(v) => void equip(props.slot, Number(v))}
      options={choices()}
      searchable={(props.slot.choices?.length ?? 0) > 8}
      triggerContent={
        <If when={props.itemOf(props.slot.itemId)} else={<Text tone="muted" class="text-sm">{s("empty")}</Text>}>
          {(cur) => <Text class={`text-sm truncate ${RARITY_TEXT[rarityOf(cur().rarity)]}`}>{tr(cur().name)}</Text>}
        </If>
      }
      renderItem={(e) => <SlotChoice slot={props.slot.name} item={props.itemOf(Number(e.value))} title={e.title} />}
    />
  );
}

/** A slot, as POB lists it: its picture and name (chosen, it shows in the detail pane), and its drop-down. */
function SlotRow(props: {
  row: SlotInfo;
  item?: ItemInfo;
  itemOf: (id: number) => ItemInfo | undefined;
  selected: boolean;
  onPress: () => void;
  class?: string;
}) {
  return (
    <ItemHover class={props.class} id={props.item?.id} rarity={rarityOf(props.item?.rarity)} slot={props.row.name}>
      <View class="flex-row items-center gap-2">
        <Row
          choose
          selected={props.selected}
          onPress={props.onPress}
          label={`${slotLabel(props.row)}: ${props.item ? tr(props.item.name) : s("empty")}`}
          class="w-40"
        >
          <ItemArt item={props.item} size={24} />
          <Text variant="caption" tone="muted" class="flex-1 truncate">
            {slotLabel(props.row)}
          </Text>
        </Row>
        <SlotSelect slot={props.row} itemOf={props.itemOf} label={slotLabel(props.row)} class="flex-1" />
      </View>
    </ItemHover>
  );
}

/** An item of the build's list: its name in its rarity's colour, and its base. */
function ItemRow(props: { item: ItemInfo; equipped: boolean; selected: boolean; onPress: () => void }) {
  return (
    <ItemHover id={props.item.id} rarity={rarityOf(props.item.rarity)}>
      <Row choose selected={props.selected} onPress={props.onPress} label={tr(props.item.name)}>
        <ItemArt item={props.item} size={24} />
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
      </Row>
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
              <SlotSelect slot={slot()} itemOf={props.itemOf} label={s("inSlot")} />
              <If when={slot().flask && slot().itemId > 0}>
                <View class="flex-row items-center gap-2">
                  <Checkbox hideLabel checked={slot().active} disabled={build.busy()} label={s("flaskActive")} onChange={(on) => void setFlask(slot().name, on)} />
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
                        >
                          <ItemHover id={it().id} rarity={rarityOf(it().rarity)} slot={slot().name}>
                            <Row
                              selected={slot().itemId === it().id}
                              onPress={() => void equip(slot(), it().id)}
                              label={tr(it().name)}
                              hint={s("compareHint")}
                            >
                              <ItemArt item={it()} size={24} />
                              <Text class={`flex-1 truncate ${RARITY_TEXT[rarityOf(it().rarity)]}`}>{tr(it().name)}</Text>
                              <If when={slot().itemId === it().id}>
                                <Badge label={s("equipped")} tone="primary" />
                              </If>
                            </Row>
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
                    label={s("equipIn")}
                    placeholder={s("equipIn")}
                    value={null}
                    onChange={(name) => {
                      const slot = props.data.slots.find((x) => x.name === name);
                      if (slot) void equip(slot, it().id);
                    }}
                    options={fitting()}
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
            <ItemArt item={it()} size={24} />
            <Text class={`flex-1 text-sm truncate ${RARITY_TEXT[rarityOf(it().rarity)]}`}>{props.title}</Text>
          </View>
        </ItemHover>
      )}
    </If>
  );
}
