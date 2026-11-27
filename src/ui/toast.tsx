// Short confirmations, the launcher's toast: in the bottom right corner, a trimmed dark plate with a ringed
// mark, sliding in from the right as it fades in. `toast(t("ledger.saved"))`, and one <Toaster/> at the root.
import { Overlay, signal, Text, View } from "nsh";
import { Toast, type ToastEntry, ToastManager, ToastStack } from "nsh/base";
import { Icon } from "./icon";

type Message = { title: string; tone: "success" | "error" | "info" };

const manager = new ToastManager();
const shown = signal<ToastEntry[]>([]);
const expanded = signal(false);
const sync = () => shown.set(manager.visible(3));
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  if (manager.advance(expanded()).changed) sync();
  if (shown().length === 0 && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

export function toast(title: string, tone: Message["tone"] = "success") {
  // an error stays longer
  manager.push(crypto.randomUUID(), { title, tone } satisfies Message, { timeout: tone === "error" ? 6000 : 3500 });
  sync();
  timer ??= setInterval(tick, 50);
}

export function Toaster() {
  // Only there while a toast shows, and only as wide as the toasts: the corner it sits in must not take the presses
  // meant for what is under it.
  return (
    <If when={shown().length}>
      <Overlay class="right-0 bottom-0 items-end p-6">
        <ToastStack
          placement="bottomRight"
          class="w-[380px] max-w-full"
          onExpandedChange={(e) => expanded.set(e.expanded)}
          onCancel={() => {
            const newest = shown().filter((t) => t.status !== "ending").at(-1);
            if (newest) {
              manager.dismiss(newest.id);
              sync();
            }
          }}
        >
          <Each of={shown()} key={(t: ToastEntry) => t.id}>
            {(t) => {
              const m = () => t().value as Message;
              const error = () => m().tone === "error";
              return (
                <Toast
                  transitionStatus={t().status}
                  accessibilityLabel={m().title}
                  onDismissRequest={() => {
                    manager.dismiss(t().id);
                    sync();
                  }}
                  class={`flex-row items-center gap-2.5 border bg-popover px-4 py-3 shadow-lg transition duration-240 ease-out motion-reduce:transition-none ${
                    error() ? "border-destructive" : "border-trim-hi"
                  }`}
                  startingClass="opacity-0 translate-x-10"
                  endingClass="opacity-0 translate-x-10"
                >
                  <View class={`size-5 items-center justify-center rounded-full border ${error() ? "border-destructive" : "border-gold"}`}>
                    <Icon name={error() ? "x" : m().tone === "info" ? "info" : "check"} size="xs" tone={error() ? "destructive" : "primary"} />
                  </View>
                  <Text class="shrink text-sm text-popover-foreground">{m().title}</Text>
                </Toast>
              );
            }}
          </Each>
        </ToastStack>
      </Overlay>
    </If>
  );
}
