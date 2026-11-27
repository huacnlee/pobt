// Fields: 28pt, a bordered field on the background whose border takes the ring colour while focused; on nsh/base's
// Input, NumberInput, Select, Switch and Checkbox.
import { type InputRef, type JSX, Text, View } from "nsh";
import { Checkbox as BaseCheckbox, Input as BaseInput, NumberInput, Select as BaseSelect, Switch as BaseSwitch, type SelectItem } from "nsh/base";
import { Icon, type IconName } from "./icon";
import { POPUP, POPUP_END, POPUP_START, WASH } from "./motion";

/** The frame every field shares. */
export const FIELD = `rounded-(--radius) border border-input bg-background ${WASH}`;

/** A one-line text field, with a well-known icon at its start (a search's). */
export function Input(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  icon?: IconName;
  accessibilityLabel?: string;
  keyboardType?: "default" | "email-address" | "number-pad" | "decimal-pad";
  autoComplete?: "email" | "one-time-code" | "off";
  autoFocus?: boolean;
  maxLength?: number;
  invalid?: boolean;
  class?: string;
  testID?: string;
  ref?: InputRef | ((r: InputRef) => void);
}) {
  return (
    <View
      class={`h-7 flex-row items-center gap-1.5 px-2 ${FIELD} focus-within:border-ring ${props.invalid ? "border-destructive" : ""} ${props.class ?? ""}`}
    >
      <If when={props.icon}>{(name) => <Icon name={name()} size="sm" tone="muted" />}</If>
      <BaseInput
        ref={props.ref}
        value={props.value}
        onChange={(e) => props.onChange(e.value)}
        onSubmit={() => props.onSubmit?.()}
        placeholder={props.placeholder}
        accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
        keyboardType={props.keyboardType}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        maxLength={props.maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        testID={props.testID}
        class="flex-1 text-sm text-foreground placeholder:text-muted-foreground"
      />
    </View>
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
    <BaseInput
      multiline
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      placeholder={props.placeholder}
      accessibilityLabel={props.accessibilityLabel}
      autoFocus={props.autoFocus}
      readonly={props.readonly}
      autoCapitalize="none"
      autoCorrect={false}
      class={`px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground ${FIELD} focus:border-ring ${props.class ?? ""}`}
    />
  );
}

/** A labelled control: its label above, a hint or an error under it. */
export function Field(props: { label: string; hint?: string; error?: string; children: JSX.Element }) {
  return (
    <View class="gap-1.5">
      <Text class="text-xs font-medium text-muted-foreground">{props.label}</Text>
      {props.children}
      <If when={props.error}>
        <Text role="alert" class="text-xs text-destructive">
          {props.error}
        </Text>
      </If>
      <If when={!props.error && props.hint}>
        <Text class="text-xs text-muted-foreground">{props.hint}</Text>
      </If>
    </View>
  );
}

/** A labelled row of a form: the label (and a hint under it), then its control at the end. */
export function FieldRow(props: { label: string; hint?: string; children?: JSX.Element }) {
  return (
    <View class="min-h-8 flex-row items-center gap-3 py-0.5">
      <View class="flex-1 gap-0.5">
        <Text class="text-sm text-foreground">{props.label}</Text>
        <If when={props.hint}>
          <Text class="text-xs text-muted-foreground">{props.hint}</Text>
        </If>
      </View>
      {props.children}
    </View>
  );
}

/** A number, typed or stepped, its steppers stacked at the right end. */
export function NumberField(props: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  class?: string;
  testID?: string;
}) {
  return (
    <NumberInput
      value={props.value}
      onChange={(e) => props.onChange(e.value)}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      placeholder={props.placeholder}
      accessibilityLabel={props.label}
      testID={props.testID}
      controlsRight
      class={`h-7 flex-row items-center overflow-hidden ${FIELD} focus-within:border-ring ${props.class ?? ""}`}
      inputClass="flex-1 px-2 text-left text-sm tabular-nums text-foreground"
      suffix={props.suffix ? <Text class="pr-2 text-xs text-muted-foreground">{props.suffix}</Text> : undefined}
      controlsClass="h-full flex-col border-l border-input"
      incrementButtonClass={`w-5 flex-1 items-center justify-center ${WASH} hover:bg-accent`}
      decrementButtonClass={`w-5 flex-1 items-center justify-center ${WASH} hover:bg-accent`}
      incrementButton={<Icon name="chevron-up" size="xs" tone="muted" />}
      decrementButton={<Icon name="chevron-down" size="xs" tone="muted" />}
    />
  );
}

/** An option of a Select: a value and its title (a Select's `SelectItem`s may also group them). */
export interface Option {
  value: string;
  title: string;
}

/** Choosing one of a list: a 28pt field, its popup opening below it on every desktop (`cover` off), as wide as the
 * field, growing from it. */
export function Select(props: {
  options: SelectItem[];
  value: string | null;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  class?: string;
  /** An option's row drawn by the caller (a hint on hover, a gem's colour); its `value` and `title` are the option's. */
  renderItem?: (item: Option) => JSX.Element;
  /** The trigger's text in place of the chosen option's title (a colour of the option's, say). */
  triggerContent?: JSX.Element;
  /** It opens: options costly to make can be asked for then. */
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
    return props.value === null ? undefined : find(props.options);
  };
  return (
    <BaseSelect
      items={props.options}
      value={props.value}
      onChange={({ value }) => value !== null && props.onChange(value)}
      onOpen={props.onOpen}
      accessibilityLabel={props.label}
      placeholder={props.placeholder}
      searchable={props.searchable}
      // Opens below its trigger on every desktop (not macOS's over-the-trigger pop-up), as POB's drop-downs do.
      cover={false}
      placement="bottom"
      offset={4}
      renderItem={props.renderItem ? (e) => props.renderItem!(e as unknown as Option) : undefined}
      // The popup lines up with the trigger, so the trigger fills the field: the list is as wide as the field and
      // `offset` is the gap below its edge.
      class={`h-7 flex-row items-stretch ${FIELD} hover:bg-accent/40 focus-visible:border-ring ${props.class ?? ""}`}
      popupClass={`max-h-80 rounded-(--radius) border border-border bg-popover p-1 shadow-lg ${POPUP}`}
      popupStartingClass={POPUP_START}
      popupEndingClass={POPUP_END}
      itemClass={`rounded-sm px-2 py-1 text-sm text-popover-foreground ${WASH} hover:bg-accent focus:bg-accent checked:text-primary`}
      groupClass="px-2 pt-2 pb-1"
      searchClass={`mb-1 h-7 px-2 text-sm text-foreground placeholder:text-muted-foreground ${FIELD} focus:border-ring`}
      trigger={
        // The trigger is the app's: the chosen option's title (or the placeholder) and a chevron.
        <View class="flex-1 flex-row items-center gap-2 px-2">
          <If
            when={props.triggerContent}
            else={<Text class={`flex-1 truncate text-sm ${chosen() ? "text-foreground" : "text-muted-foreground"}`}>{chosen() ?? props.placeholder ?? ""}</Text>}
          >
            <View class="flex-1">{props.triggerContent}</View>
          </If>
          <Icon name="chevron-down" size="sm" tone="muted" />
        </View>
      }
    />
  );
}

/** On or off. `label` shows beside it; `name` is what a screen reader calls it when the label alone does not say what
 * it turns on; with `hideLabel` only the switch shows (its row says what it is). */
export function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string; name?: string; hideLabel?: boolean; disabled?: boolean }) {
  return (
    <BaseSwitch
      checked={props.checked}
      onChange={(e) => props.onChange(e.checked)}
      disabled={props.disabled}
      accessibilityLabel={props.name ?? props.label}
      class="flex-row items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      trackClass={`h-5 w-9 rounded-full border border-input bg-muted ${WASH} checked:border-primary checked:bg-primary`}
      thumbClass="m-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition duration-180 ease-out checked:translate-x-4 checked:bg-primary-foreground motion-reduce:transition-none"
    >
      <If when={!props.hideLabel}>
        <Text class="text-sm text-foreground">{props.label}</Text>
      </If>
    </BaseSwitch>
  );
}

/** A box ticked for yes; `children` in place of the label (a step's text). The check shows only while checked. With
 * `hideLabel` only the box shows, for a table's cell whose row says what it is. */
export function Checkbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  children?: JSX.Element;
}) {
  return (
    <BaseCheckbox
      checked={props.checked}
      onChange={(e) => props.onChange(e.checked)}
      disabled={props.disabled}
      accessibilityLabel={props.label}
      class={`flex-row items-start gap-2.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        props.hideLabel ? "" : `px-2 py-1.5 ${WASH} hover:bg-accent/60`
      }`}
      indicatorClass={`h-4 w-4 items-center justify-center rounded-sm border border-input bg-background ${WASH} hover:border-primary/70 checked:border-primary checked:bg-primary ${
        props.hideLabel ? "" : "mt-0.5"
      }`}
      indicator={
        <If when={props.checked}>
          <Icon name="check" size="xs" tone="on-primary" strokeWidth={3} />
        </If>
      }
    >
      <If when={!props.hideLabel}>{props.children ?? <Text class="text-sm text-foreground">{props.label}</Text>}</If>
    </BaseCheckbox>
  );
}
