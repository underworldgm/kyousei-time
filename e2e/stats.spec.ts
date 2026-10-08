import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

function ymd(offsetDays: number) {
  return new Date(Date.now() + 9 * 3600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

test("グラフ: 期間の切り替え・棒をタップして詳細・最近7日間の一覧", async ({ page }) => {
  const csv = ["日付,開始時間,終了時間", `${ymd(1)},07:00,22:00`, `${ymd(2)},08:00,20:00`, `${ymd(3)},07:00,21:30`].join("\n");
  await openApp(page, "/settings");
  await page.locator("input[type=file]").setInputFiles({ name: "b.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("3件を追加しました")).toBeVisible();

  await page.getByRole("link", { name: "グラフ" }).click();
  await expect(page.getByRole("heading", { name: "7日間の装着時間" })).toBeVisible();
  await expect(page.locator(".stat-grid")).toContainText("2 / 7");
  await expect(page.locator(".stat-grid")).toContainText("15時間00分"); // いちばん長い日
  await expect(page.locator(".stat-grid")).toContainText("12時間00分"); // いちばん短い日
  await expect(page.locator(".recent-table tbody tr")).toHaveCount(7);

  const bars = page.locator(".bar-chart .hit");
  await expect(bars).toHaveCount(7);
  await bars.nth(5).click(); // 昨日
  await expect(page.locator(".chart-detail")).toContainText("15時間00分・目標達成");
  await bars.nth(4).click();
  await expect(page.locator(".chart-detail")).toContainText("あと2時間00分");

  await page.getByRole("tab", { name: "月", exact: true }).click();
  await expect(bars).toHaveCount(30);
  await page.getByRole("tab", { name: "3か月" }).click();
  await expect(bars).toHaveCount(13);
  await expect(page.getByRole("heading", { name: "週ごとの平均（13週）" })).toBeVisible();
});
