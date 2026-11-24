// The app, headless: `nsh test` runs this file in a runner it builds
// with the crate, at the window's size (nsh.json).
import { expect, open, test } from "nsh/test";

type App = Awaited<ReturnType<typeof open>>;

/** The first screen: the build editor's build list where Path of Building is installed, else the launcher, which
 * sets it up. */
async function home(app: App): Promise<"editor" | "launcher"> {
  await app.waitUntil(() => app.texts().includes("新建构建") || app.texts().includes("启动"));
  return app.texts().includes("新建构建") ? "editor" : "launcher";
}

test("opens on the build editor, or the launcher to set Path of Building up", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  expect(app.texts()).toContain("POBT");
  await home(app);
});

test("goes from the build editor to the classic Path of Building's launcher", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  if ((await home(app)) !== "editor") return;
  await app.press("text:工具");
  await app.press("text:经典版 Path of Building（旧版）");
  await app.waitFor("text:启动");
});

test("opens the characters page from the Tools menu, and back", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  await app.press("text:工具");
  await app.press("text:角色导入");
  await app.press("id:tab-Poe1");
  await app.waitFor("text:获取角色");
  expect(app.texts()).toContain("腾讯服");
  expect(app.texts()).toContain("POESESSID");
  await app.press("text:返回");
  await home(app);
});

test("explains how to get the POESESSID", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  await app.press("text:工具");
  await app.press("text:角色导入");
  await app.press("id:tab-Poe1");
  // The realm, before any saved account of it.
  await app.press("text:腾讯服 >> nth=0");
  await app.press("text:如何获取？");
  await app.waitFor("text:获取 POESESSID");
  expect(app.texts().some((t) => t.includes("poe.game.qq.com"))).toBe(true);
  await app.press("text:知道了");
  expect(app.texts()).not.toContain("获取 POESESSID");
});

test("signs in to Path of Exile 2's site for its characters", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  await app.press("text:工具");
  await app.press("text:角色导入");
  await app.press("id:tab-Poe2");
  // Tencent's, by a WeGame share link; the official site's, signed in to.
  await app.press("id:tab-wegame");
  await app.waitFor("text:WeGame 分享链接");
  await app.press("id:tab-poe2");
  await app.waitFor("text:登录并获取角色");
  expect(app.texts()).not.toContain("获取角色");
  expect(app.texts()).not.toContain("POESESSID");
  await app.press("id:tab-Poe1");
  await app.waitFor("text:获取角色");
});

test("shows and hides the POESESSID", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  await app.press("text:工具");
  await app.press("text:角色导入");
  await app.press("id:tab-Poe1");
  await app.press("text:显示");
  await app.waitFor("text:隐藏");
  await app.press("text:隐藏");
  await app.waitFor("text:显示");
});

test("opens the AI analysis page from the Tools menu, and back", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  await app.press("text:工具");
  await app.press("text:AI 构筑分析");
  await app.waitFor("text:开始分析");
  expect(app.texts()).toContain("AI 分析");
  await app.press("text:构筑代码 >> nth=0");
  await app.waitFor("text:粘贴构筑代码（Path of Building 的导出）");
  await app.press("text:返回");
  await home(app);
});
