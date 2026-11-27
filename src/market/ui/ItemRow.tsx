// A market row in a list: name and category, its sparkline, price and change, its anomaly tags. Opens the item.
import { Text, View } from "nsh";
import { categoryLabel, itemName, t } from "../data/i18n";
import { ItemArt } from "./ItemArt";
import { Sparkline } from "./Chart";
import { price } from "./format";
import { Change } from "./Stat";
import { Row, Badge, type BadgeTone } from "../../ui";

export type TagName = "below7d" | "above7d" | "volumeSpike" | "newHigh" | "newLow" | "thin";

export const TAG_TONE: Record<TagName, BadgeTone> = {
  below7d: "down",
  above7d: "up",
  volumeSpike: "warning",
  newHigh: "up",
  newLow: "down",
  thin: "neutral",
};

/** An anomaly tag as a badge. */
export function TagBadge(props: { tag: TagName }) {
  return <Badge label={t(`tag.${props.tag}`)} tone={TAG_TONE[props.tag]} />;
}

export interface ItemRowData {
  id: string;
  name: string;
  category: string;
  chaos: number;
  spark?: number[];
  tags: TagName[];
  icon?: string;
}

export function ItemRow(props: { item: ItemRowData; divine: number; change: number | undefined; onPress: () => void; showTags?: boolean; testID?: string }) {
  return (
    <Row onPress={props.onPress} label={itemName(props.item.name)} testID={props.testID}>
      <ItemArt icon={props.item.icon} name={props.item.name} size={32} />
      <View class="flex-1 gap-0.5">
        <Text class="text-sm text-foreground line-clamp-1">{itemName(props.item.name)}</Text>
        <View class="flex-row flex-wrap items-center gap-1.5">
          <Text class="text-xs text-muted-foreground">{categoryLabel(props.item.category)}</Text>
          <If when={props.showTags}>
            <Each of={props.item.tags.filter((tag) => tag !== "thin")} key={(t: TagName) => t}>
              {(tag) => <TagBadge tag={tag()} />}
            </Each>
          </If>
        </View>
      </View>
      <Sparkline values={props.item.spark} />
      <Text class="w-24 text-right text-sm tabular-nums text-foreground">{price(props.item.chaos, props.divine)}</Text>
      <View class="w-20">
        <Change value={props.change} />
      </View>
    </Row>
  );
}
