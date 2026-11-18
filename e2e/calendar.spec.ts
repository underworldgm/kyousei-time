import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

/** 前月のデータを CSV で入れ、カレンダー表示・スタンプ・日別詳細を確認する */
function prevMonth(): { y: number; m: number } {
  const d = new Date(Date.now() + 9 * 3600_000);
  const n = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1;
  return { y: Math.floor(n / 12), m: (n % 12) + 1 };
}

test("CSV 復元 → 前月のスタンプと日別履歴 (日付またぎ含む)", async ({ page }) => {
  const { y, m } = prevMonth();
  const mm = String(m).padStart(2, "0");
  const csv = [
    "日付,開始時間,終了時間,装着時間,目標時間,達成",
    `${y}-${mm}-01,07:30,10:15,165,840,true`,
    `${y}-${mm}-01,11:10,16:30,320,840,true`,
    `${y}-${mm}-01,17:15,23:30,375,840,true`,
    `${y}-${mm}-02,07:30,12:00,270,840,false`,
    `${y}-${mm}-02,23:00,24:00,60,840,false`,
    `${y}-${mm}-03,00:00,02:00,120,840,false`,
  ].join("\r\n");
  await openApp(page, "/settings");
  await page.locator("input[type=file]").setInputFiles({ name: "backup.csv", mimeType: "text/csv", buffer: Buffer.from("﻿" + csv) });
  await expect(page.getByText("5件を追加しました")).toBeVisible(); // 日付またぎの2行は1件に結合

  await page.getByRole("link", { name: "カレンダー" }).click();
  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page.getByRole("heading", { name: `${y}年${m}月` })).toBeVisible();
  const day1 = page.getByRole("button", { name: new RegExp(`^${m}月1日 目標達成`) });
  await expect(day1).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${m}月2日 未達成 5時間30分`) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${m}月3日 未達成 2時間00分`) })).toBeVisible();

  await day1.click();
  const detail = page.locator(".detail-card");
  await expect(detail).toContainText("14時間20分");
  await expect(detail).toContainText("目標達成！");
  await expect(detail).toContainText("よくできました！");
  await expect(detail.locator(".session-row")).toHaveCount(3);

  await page.getByRole("button", { name: new RegExp(`^${m}月2日`) }).click();
  await expect(detail).toContainText("あと8時間30分");
  await expect(detail).toContainText("翌02:00");
  await expect(page.locator(".month-summary")).toContainText("1 /");
});

test("今日は強調、選択日は枠で区別される", async ({ page }) => {
  await openApp(page, "/calendar");
  const today = page.locator(".cal-day.today");
  await expect(today).toHaveCount(1);
  await expect(today).toHaveAttribute("aria-current", "date");
  await expect(today).toHaveClass(/selected/);
  await page.locator(".cal-day:not(.today):not(.future)").first().click();
  await expect(page.locator(".cal-day.selected")).toHaveCount(1);
  await expect(today).not.toHaveClass(/selected/);
});
