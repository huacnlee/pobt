// The app, headless: `nsh test` runs this file in a runner it builds
// with the crate, at the window's size (nsh.json).
import { expect, open, test } from "nsh/test";

type App = Awaited<ReturnType<typeof open>>;

/** The first screen: the launcher, the way in to the build editor and the classic Path of Building. */
async function home(app: App): Promise<void> {
  await app.waitFor("text:启动");
}

/** The build editor's build list, by the launcher's Start; false where no Path of Building is set up (or the classic one
 * is chosen), which Start does not open the editor for. */
async function editor(app: App): Promise<boolean> {
  await home(app);
  await app.press("text:启动");
  try {
    await app.waitFor("text:新建 Build", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

test("opens on the launcher", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  expect(app.texts()).toContain("POBT");
  await home(app);
  expect(app.texts()).toContain("使用经典版 Path of Building（旧版）");
});

test("starts the build editor from the launcher, and back", async () => {
  const app = await open("../App.tsx", { width: 1280, height: 820 });
  if (!(await editor(app))) return;
  await app.press("text:工具");
  await app.press("text:返回启动页");
  await home(app);
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

