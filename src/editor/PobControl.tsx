// A control of Path of Building's, drawn with POBT's own: a drop-down as a Select, an edit box as a text field, a check
// box as a Checkbox. Acting on it acts on POB's control, so POB's own handler makes the change.
import { signal } from "nsh";
import { Checkbox, Select, Input } from "../ui";
import { plain } from "./ColoredText";
import { tr } from "./i18n";
import { act, type Control } from "./session";

export function PobControl(props: {
  control: Control | undefined;
  /** From the build to POB's control: `["controls", "mainSocketGroup"]`. */
  path: (string | number)[];
  /** What screen readers call it (translated by the caller). */
  label: string;
  class?: string;
  /** Called instead of `act` (a page that acts through an operation of its own). */
  onAct?: (value: number | string | boolean) => void;
}) {
  const send = (v: number | string | boolean) => (props.onAct ? props.onAct(v) : void act(props.path, v));
  // An edit box sends its text when the user pauses, as POB applies it as they type.
  const draft = signal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const typed = (v: string) => {
    draft.set(v);
    clearTimeout(timer);
    timer = setTimeout(() => {
      send(v);
      draft.set(null);
    }, 400);
  };
  return (
    <If when={props.control?.shown}>
      {props.control?.kind === "list" ? (
        <Select
          label={props.label}
          options={(props.control?.items ?? []).map((title, i) => ({ value: String(i + 1), title: tr(plain(title)) }))}
          value={props.control?.sel ? String(props.control.sel) : null}
          onChange={(v) => send(Number(v))}
          class={props.class}
        />
      ) : props.control?.kind === "edit" ? (
        <Input
          accessibilityLabel={props.label}
          value={draft() ?? props.control?.text ?? ""}
          placeholder={props.control?.placeholder ?? undefined}
          onChange={typed}
          onSubmit={() => {
            clearTimeout(timer);
            if (draft() !== null) send(draft()!);
          }}
          class={props.class}
        />
      ) : props.control?.kind === "check" ? (
        <Checkbox hideLabel label={props.label} checked={!!props.control?.checked} onChange={(on) => send(on)} />
      ) : null}
    </If>
  );
}
