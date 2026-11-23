// The launcher, headless: `nsh test` runs this file in a runner it builds
// with the crate.
import { expect, open, test } from "nsh/test";

test("shows the launcher", async () => {
  const app = await open("../App.tsx");
  expect(app.texts()).toContain("POBT");
  expect(app.texts()).toContain("启动");
});

test("opens the characters page from the launcher, and back", async () => {
  const app = await open("../App.tsx");
  await app.press("text:角色导入");
  await app.waitFor("text:获取角色");
  expect(app.texts()).toContain("腾讯服");
  expect(app.texts()).toContain("POESESSID");
  await app.press("text:返回主界面");
  await app.waitFor("text:启动");
});
