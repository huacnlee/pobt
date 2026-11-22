// The launcher, headless: `nsh test` runs this file in a runner it builds
// with the crate.
import { expect, open, test } from "nsh/test";

test("shows the launcher", async () => {
  const app = await open(".");
  expect(app.texts()).toContain("POBT");
  expect(app.texts()).toContain("启动");
});
