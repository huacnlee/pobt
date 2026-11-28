// The build editor alone, opening testdata/build.xml on the launcher's Path of Building, with the app's toasts: for
// editor.test.tsx.
import { mount, View } from "nsh";
import { Toaster } from "../ui";
import { BuildEditor } from "./BuildEditor";

mount(() => (
  <View class="flex-1">
    <BuildEditor game="poe1" file="src/editor/testdata/build.xml" onBack={() => {}} />
    <Toaster />
  </View>
));
