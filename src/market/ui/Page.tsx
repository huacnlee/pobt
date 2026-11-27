// A page of the market, headed as the build editor is (its Header): a 48pt bar on the card colour with back, the title
// in the display face in gold, its line beside it and the actions at the end; then its content, padded as the build
// editor's pages are.
import { type JSX, Scroll, Text, View } from "nsh";
import { NavPage } from "nsh/base";
import { t } from "../data/i18n";
import { Button } from "../../ui";

export function Page(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: JSX.Element;
  children: JSX.Element;
  /** False for a page that scrolls itself (a List). */
  scroll?: boolean;
  footer?: JSX.Element;
  testID?: string;
}) {
  return (
    <NavPage testID={props.testID} header={<View />} class="flex-1 bg-background">
      <View class="h-12 flex-row items-center gap-3 border-b border-border bg-card px-3">
        <If when={props.onBack}>
          {(back) => (
            <>
              <Button label={t("common.back")} icon="chevron-left" variant="ghost" size="sm" onPress={back()} />
              <View class="h-6 w-px bg-border" />
            </>
          )}
        </If>
        <Text role="header" class="shrink truncate font-display text-lg tracking-widest text-primary">
          {props.title}
        </Text>
        <Text class="flex-1 truncate text-sm text-muted-foreground">{props.subtitle ?? ""}</Text>
        <If when={props.actions}>
          <View class="flex-row items-center gap-2">{props.actions}</View>
        </If>
      </View>
      <If when={props.scroll !== false} else={<View class="flex-1">{props.children}</View>}>
        <Scroll class="flex-1" contentClass="gap-4 p-4" scrollbar>
          {props.children}
        </Scroll>
      </If>
      {props.footer}
    </NavPage>
  );
}

/** The line every page with prices ends on. */
export function Disclaimer() {
  return (
    <View class="border-t border-border bg-card px-4 py-1.5">
      <Text class="text-xs text-muted-foreground">{`${t("common.disclaimer")} ${t("common.notAffiliated")}`}</Text>
    </View>
  );
}
