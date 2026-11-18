import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("はじめて開くと、かんたん設定が出て、名前・目標・通知を決められる", async ({ page }) => {
  await page.goto("/");
  const dlg = page.getByRole("dialog", { name: "ようこそ！" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("お子さまの名前（ニックネーム）").fill("ゆい");
  await dlg.getByRole("radio", { name: "アイコン 🐱" }).click();
  await dlg.getByRole("button", { name: "目標時間を30分減らす" }).click();
  await dlg.getByRole("button", { name: "目標時間を30分減らす" }).click();
  await expect(dlg.locator("output")).toHaveText("13時間");
  await dlg.getByRole("button", { name: "はじめる" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".hero-sub")).toContainText("ゆいの");
  await expect(page.locator(".goal-chip")).toContainText("13時間");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "ようこそ！" })).toHaveCount(0); // 2回目以降は出ない
});

test("「あとで」で閉じられ、もう出ない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("dialog", { name: "ようこそ！" }).getByRole("button", { name: "あとで" }).click();
  await expect(page.getByRole("button", { name: "装着開始" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "ようこそ！" })).toHaveCount(0);
});
