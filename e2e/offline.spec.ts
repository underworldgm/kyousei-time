import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("Service Worker 有効化後はオフラインで起動・記録・設定変更できる", async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // SW の制御下に入る
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "装着開始" })).toBeVisible();
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.getByText("現在：装着中")).toBeVisible();

  await page.getByRole("link", { name: "カレンダー" }).click();
  await expect(page.locator(".cal-grid")).toBeVisible();
  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "目標時間を1時間減らす" }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました")).toBeVisible();

  // オフラインのまま再起動しても状態が残る
  await page.reload();
  await page.getByRole("link", { name: "時間" }).click();
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await expect(page.locator(".goal-chip")).toContainText("13時間");
  await context.setOffline(false);
});
