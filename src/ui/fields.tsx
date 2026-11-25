import { type InputRef, type JSX, View } from "nsh";
import { Checkbox as BaseCheckbox, Input, NumberInput, Select as BaseSelect, Switch as BaseSwitch, type SelectItem } from "nsh/base";
import { Icon } from "nsh-icon";
import { Check, ChevronDown, ChevronUp } from "nsh-icon-lucide";
import { POPUP, POPUP_END, POPUP_START, WASH } from "./motion";
import { Text } from "./text";

const FIELD = `rounded-(--radius) border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground ${WASH} focus:border-ring`;

/** A one-line text field. */
export function TextField(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  class?: string;
  ref?: InputRef | ((r: InputRef) => void);
}) {
  return (
    <Input
      ref={props.ref}
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      onSubmit={() => props.onSubmit?.()}
      placeholder={props.placeholder}
      accessibilityLabel={props.accessibilityLabel}
      autoFocus={props.autoFocus}
      autoCapitalize="none"
      autoCorrect={false}
      class={`h-7 px-2 ${FIELD} ${props.class ?? ""}`}
    />
  );
}

/** Text over several lines: a build code, notes. */
export function TextArea(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
  readonly?: boolean;
  class?: string;
}) {
  return (
    <Input
      multiline
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      placeholder={props.placeholder}
      accessibilityLabel={props.accessibilityLabel}
      autoFocus={props.autoFocus}
      readonly={props.readonly}
      autoCapitalize="none"
      autoCorrect={false}
      class={`px-2 py-1.5 ${FIELD} ${props.class ?? ""}`}
    />
  );
}

/** A choice from a list, its popup growing from the trigger. */
export function Select(props: {
  items: SelectItem[];
  value: string | null;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  searchable?: boolean;
  class?: string;
  /** An item's row drawn by the caller (a hint on hover, a gem's colour); its `value` and `title` are the item's. */
  renderItem?: (item: { value: string; title: string }) => JSX.Element;
  /** The trigger's text in place of the chosen item's title (a colour of the item's, say). */
  triggerContent?: JSX.Element;
  /** It opens: items costly to make can be asked for then. */
  onOpen?: () => void;
}) {
  const chosen = () => {
    const find = (list: SelectItem[]): string | undefined => {
      for (const it of list) {
        if ("items" in it && Array.isArray((it as { items?: SelectItem[] }).items)) {
          const t = find((it as { items: SelectItem[] }).items);
          if (t !== undefined) return t;
        } else if ((it as { value?: string }).value === props.value) return (it as { title?: string }).title;
      }
    };
    return props.value === null ? undefined : find(props.items);
  };
  return (
    <BaseSelect
      items={props.items}
      value={props.value}
      onChange={({ value }) => value !== null && props.onChange(value)}
      onOpen={props.onOpen}
      accessibilityLabel={props.accessibilityLabel}
      placeholder={props.placeholder}
      searchable={props.searchable}
      // Opens below its trigger on every desktop (not macOS's over-the-trigger pop-up), as POB's drop-downs do.
      cover={false}
      placement="bottom"
      offset={4}
      renderItem={props.renderItem ? (e) => props.renderItem!(e as unknown as { value: string; title: string }) : undefined}
      // The popup lines up with the trigger, so the trigger fills the field: the list is as wide as the field and
      // `offset` is the gap below its edge.
      class={`h-7 flex-row items-stretch ${FIELD} hover:bg-accent/40 ${props.class ?? ""}`}
      popupClass={`max-h-80 rounded-(--radius) border border-border bg-popover p-1 shadow-lg ${POPUP}`}
      popupStartingClass={POPUP_START}
      popupEndingClass={POPUP_END}
      itemClass={`rounded-sm px-2 py-1 text-sm text-popover-foreground ${WASH} hover:bg-accent focus:bg-accent checked:text-primary`}
      groupClass="px-2 pt-2 pb-1"
      searchClass={`mb-1 h-7 px-2 ${FIELD}`}
      trigger={
        // The trigger is the app's: the chosen item's title (or the placeholder) and a chevron.
        <View class="flex-1 flex-row items-center gap-2 px-2">
          <If
            when={props.triggerContent}
            else={
              <Text class="flex-1 text-sm truncate" tone={chosen() ? "default" : "muted"}>
                {chosen() ?? props.placeholder ?? ""}
              </Text>
            }
          >
            <View class="flex-1">{props.triggerContent}</View>
          </If>
          <Icon icon={ChevronDown} size={14} class="text-muted-foreground" />
        </View>
      }
    />
  );
}

/** An on/off setting. */
export function Switch(props: { checked: boolean; onChange: (on: boolean) => void; accessibilityLabel: string; disabled?: boolean }) {
  return (
    <BaseSwitch
      checked={props.checked}
      disabled={props.disabled}
      onChange={({ checked }) => props.onChange(checked)}
      accessibilityLabel={props.accessibilityLabel}
      class="focus-visible:ring-2 focus-visible:ring-ring rounded-full disabled:opacity-50"
      trackClass={`h-5 w-9 rounded-full border border-input bg-muted ${WASH} checked:border-primary checked:bg-primary`}
      thumbClass="m-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition duration-180 ease-out checked:translate-x-4 checked:bg-primary-foreground motion-reduce:transition-none"
    />
  );
}

/** A box ticked for yes. */
export function Checkbox(props: { checked: boolean; onChange: (on: boolean) => void; accessibilityLabel: string; label?: string; disabled?: boolean }) {
  return (
    <BaseCheckbox
      checked={props.checked}
      disabled={props.disabled}
      onChange={({ checked }) => props.onChange(checked)}
      accessibilityLabel={props.accessibilityLabel}
      class="flex-row items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      indicatorClass={`h-4 w-4 items-center justify-center rounded-sm border border-input bg-background ${WASH} hover:border-primary/70 checked:border-primary checked:bg-primary`}
      // nsh-base draws no mark: the check shows while checked, as shadcn's does.
      indicator={
        <If when={props.checked}>
          <Icon icon={Check} size={12} strokeWidth={3} class="text-primary-foreground" />
        </If>
      }
    >
      <If when={props.label}>
        <Text>{props.label}</Text>
      </If>
    </BaseCheckbox>
  );
}

/** A number, typed or stepped. */
export function NumberField(props: {
  value: number | null;
  onChange: (value: number | null) => void;
  accessibilityLabel: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  class?: string;
}) {
  return (
    <NumberInput
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      accessibilityLabel={props.accessibilityLabel}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      placeholder={props.placeholder}
      class={`h-7 flex-row items-center ${FIELD} ${props.class ?? ""}`}
      inputClass="flex-1 px-2 text-sm text-foreground"
      controlsClass="flex-col border-l border-input"
      incrementButtonClass={`flex-1 w-5 items-center justify-center ${WASH} hover:bg-accent`}
      decrementButtonClass={`flex-1 w-5 items-center justify-center ${WASH} hover:bg-accent`}
      incrementButton={<Icon icon={ChevronUp} size={10} class="text-muted-foreground" />}
      decrementButton={<Icon icon={ChevronDown} size={10} class="text-muted-foreground" />}
    />
  );
}

/** A labelled row of a form: the label, then its control. */
export function FieldRow(props: { label: string; hint?: string; children?: import("nsh").JSX.Element }) {
  return (
    <View class="min-h-8 flex-row items-center gap-3 py-0.5">
      <View class="flex-1 gap-0.5">
        <Text>{props.label}</Text>
        <If when={props.hint}>
          <Text variant="caption" tone="muted">
            {props.hint}
          </Text>
        </If>
      </View>
      {props.children}
    </View>
  );
}
