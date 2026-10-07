import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("nav[aria-label='メインメニュー']")).toBeVisible();
}

/** 今日 (JST) の記録を手動追加 */
export async function addRecordToday(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: "記録を追加する" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("開始時刻").fill(start);
  await dlg.getByLabel("終了時刻").fill(end);
  await dlg.getByRole("button", { name: "追加する" }).click();
  await expect(dlg).toHaveCount(0);
}

/** JST の現在時刻 "HH:MM" */
export function jstNowHM(offsetMin = 0): string {
  const d = new Date(Date.now() + offsetMin * 60_000 + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function jstMinutesSinceMidnight(): number {
  const d = new Date(Date.now() + 9 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
