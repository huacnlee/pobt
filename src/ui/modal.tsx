// A dialog over the window: the dialog and its backdrop fade in; a title in the display face (and a line under it),
// its content, then its actions at the end. Escape and a press outside close it.
import { type JSX, Text, View } from "nsh";
import { AlertDialog, Dialog } from "nsh/base";
import { t } from "nsh/i18n";

export function Modal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: JSX.Element;
  footer?: JSX.Element;
  /** Its width (default 480pt). */
  class?: string;
}) {
  return (
    <Dialog
      open={props.open}
      animation="fade"
      accessibilityLabel={props.title}
      onOpenChange={(e) => props.onOpenChange(e.open)}
      backdropClass="bg-overlay"
      class={`m-auto max-h-[85%] max-w-[90%] gap-3 rounded-(--radius) border border-border bg-popover p-4 shadow-lg ${props.class ?? "w-[480px]"}`}
    >
      {/* its content is made as it opens, so it starts fresh each time */}
      <If when={props.open}>
        <View class="gap-1">
          <Text role="header" class="font-display text-lg tracking-wide text-popover-foreground">
            {props.title}
          </Text>
          <If when={props.description}>
            <Text class="text-sm text-muted-foreground">{props.description}</Text>
          </If>
        </View>
        {props.children}
        <If when={props.footer}>
          <View class="flex-row items-center justify-end gap-2">{props.footer}</View>
        </If>
      </If>
    </Dialog>
  );
}

/** Asks before something that cannot be undone; resolves with whether to go on. */
export async function confirm(options: { title: string; description?: string; action: string; destructive?: boolean }): Promise<boolean> {
  const result = await AlertDialog.show({
    title: options.title,
    description: options.description,
    actions: [
      { id: "cancel", label: t("common.cancel"), role: "cancel" },
      { id: "ok", label: options.action, role: options.destructive ? "destructive" : "default" },
    ],
  });
  return result.action === "ok";
}
