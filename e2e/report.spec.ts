import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("月ごとのレポート (PDF/印刷用) に集計と日別の記録が出る", async ({ page }) => {
  const y = new Date(Date.now() + 9 * 3600_000 - 86_400_000).toISOString().slice(0, 10); // 昨日
  const csv = ["日付,開始時間,終了時間", `${y},07:00,12:00`, `${y},13:00,22:30`].join("\n");
  await openApp(page, "/settings");
  await page.getByLabel("名前（ニックネーム）").fill("みな");
  await page.getByRole("button", { name: "保存する" }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "b.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("2件を追加しました")).toBeVisible();
  await page.getByRole("link", { name: "PDFで保存（月ごとのレポート）" }).click();

  const sheet = page.getByRole("article", { name: "装着記録レポート" });
  await expect(sheet).toContainText("矯正装置 装着記録");
  await expect(sheet).toContainText("みな");
  await expect(page.locator("nav.nav")).toHaveCount(0);
  const [, m, d] = y.split("-").map(Number);
  // 昨日が先月の場合もあるので、その月へ移動
  const nowM = Number(new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 7));
  if (nowM !== m) await page.getByRole("button", { name: "前の月" }).click();
  const row = sheet.locator("tbody tr", { hasText: `${m}/${d}（` });
  await expect(row).toContainText("14時間30分");
  await expect(row).toContainText("◎ 達成");
  await expect(sheet.locator(".report-summary")).toContainText("1 /");

  // 印刷レイアウト: 操作ボタンが消え、時間帯の列が出る
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".report-tools")).toBeHidden();
  await expect(row.locator(".ranges")).toBeVisible();
  await expect(row.locator(".ranges")).toContainText("07:00→12:00、13:00→22:30");
});
