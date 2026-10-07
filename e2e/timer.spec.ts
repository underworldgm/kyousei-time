import { expect, test } from "@playwright/test";
import { addRecordToday, jstMinutesSinceMidnight, jstNowHM, openApp } from "./helpers";

test("装着開始 → リロードしても装着中が続く → 1分未満の終了は記録しない", async ({ page }) => {
  await openApp(page);
  await expect(page.getByText("現在：外しています")).toBeVisible();
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await expect(page.getByText("自動で記録しました")).toBeVisible();
  await page.reload();
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await expect(page.getByRole("button", { name: "装着終了" })).toBeVisible();
  await page.getByRole("button", { name: "装着終了" }).click();
  await expect(page.getByText("1分未満だったので記録しませんでした")).toBeVisible();
  await expect(page.getByText("まだ今日の記録はありません")).toBeVisible();
});

test("連打しても装着中のセッションは1つだけ", async ({ page }) => {
  await openApp(page);
  const btn = page.locator(".btn-main");
  await btn.click({ clickCount: 3 });
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await expect(page.locator(".session-row.active")).toHaveCount(1);
});

test("装着中の開始時刻を直して終了 → 合計と残りが更新される", async ({ page }) => {
  test.skip(jstMinutesSinceMidnight() < 130, "JST 02:10 以前は当日内で2時間さかのぼれない");
  await openApp(page);
  await page.getByRole("button", { name: "装着開始" }).click();
  await page.locator(".session-row.active").getByRole("button", { name: /編集/ }).click();
  const dlg = page.locator("dialog[open]");
  await expect(dlg.getByText("装着中のため")).toBeVisible();
  await dlg.getByLabel("開始時刻").fill(jstNowHM(-120));
  await dlg.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".kv")).toContainText("2時間00分");
  await page.getByRole("button", { name: "装着終了" }).click();
  await expect(page.locator(".today-total")).toContainText("2時間00分");
  await expect(page.locator(".session-row")).toHaveCount(1);
});

test("手動追加・編集・削除 (確認あり) で合計が再計算される", async ({ page }) => {
  test.skip(jstMinutesSinceMidnight() < 200, "JST 03:20 以前は当日内に記録を置けない");
  await openApp(page);
  await addRecordToday(page, "00:30", "01:30");
  await expect(page.locator(".today-total")).toContainText("1時間00分");
  await addRecordToday(page, "02:00", "03:00");
  await expect(page.locator(".today-total")).toContainText("2時間00分");

  // 重なる記録は拒否
  await page.getByRole("button", { name: "記録を追加する" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("開始時刻").fill("00:45");
  await dlg.getByLabel("終了時刻").fill("01:15");
  await dlg.getByRole("button", { name: "追加する" }).click();
  await expect(dlg.getByRole("alert")).toContainText("重なっています");
  await dlg.getByRole("button", { name: "キャンセル" }).click();

  // 編集
  await page.locator(".session-row").first().getByRole("button", { name: /編集/ }).click();
  await page.locator("dialog[open]").getByLabel("終了時刻").fill("01:45");
  await page.locator("dialog[open]").getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".today-total")).toContainText("2時間15分");

  // 削除 (キャンセル → 実行)
  await page.locator(".session-row").first().getByRole("button", { name: /削除/ }).click();
  await expect(page.getByText("この装着記録を削除しますか？")).toBeVisible();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.locator(".session-row")).toHaveCount(2);
  await page.locator(".session-row").first().getByRole("button", { name: /削除/ }).click();
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(page.locator(".session-row")).toHaveCount(1);
  await expect(page.locator(".today-total")).toContainText("1時間00分");
  await page.reload();
  await expect(page.locator(".today-total")).toContainText("1時間00分");
});

test("終了 < 開始 は保存できない", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "記録を追加する" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("開始時刻").fill("10:00");
  await dlg.getByLabel("終了時刻").fill("09:00");
  await dlg.getByRole("button", { name: "追加する" }).click();
  await expect(dlg.getByRole("alert")).toBeVisible();
});
