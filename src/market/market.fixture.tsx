// The market alone, as POBT shows it from the Tools menu (its state at the title bar's end, then its sections), for
// market.test.tsx: in the system's language, with no Path of Building behind it.
import { mount, Text, View } from "nsh";
import { Toaster } from "../ui";
import { MarketStatus, MarketView } from "./Shell";

mount(() => (
  <View class="flex-1 bg-background">
    <View class="h-11 flex-row items-center gap-2.5 border-b border-trim-hi/20 bg-chrome px-5">
      <Text class="font-display text-sm font-semibold tracking-[4px] text-gold">POBT</Text>
      <View class="flex-1" />
      <MarketStatus />
    </View>
    <MarketView />
    <Toaster />
  </View>
));
