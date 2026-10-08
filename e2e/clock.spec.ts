import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";


test("仮想時計: 装着中に目標達成 → 通知は1回 → 日付をまたいでも正しく分割", async ({ page }) => {
  // 通知の呼び出しを記録 (SW 経由 / 直接の両方)
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: string[] };
    w.__notes = [];
    ServiceWorkerRegistration.prototype.showNotification = function (title: string, opts?: NotificationOptions) {
      w.__notes.push(`${title}|${opts?.body ?? ""}`);
      return Promise.resolve(); // 実際の表示はしない (ヘッドレスは許可がないため)
    };
    const N = window.Notification;
    class Spy extends N {
      constructor(title: string, opts?: NotificationOptions) {
        super(title, opts);
        w.__notes.push(`${title}|${opts?.body ?? ""}`);
      }
    }
    // ヘッドレスブラウザは通知許可が常に denied になるため「許可済み」を再現する
    Object.defineProperty(Spy, "permission", { get: () => "granted" });
    Object.defineProperty(Spy, "requestPermission", { value: async () => "granted" });
    (window as unknown as { Notification: typeof Notification }).Notification = Spy as unknown as typeof Notification;

  });
  await page.clock.install({ time: new Date("2026-10-07T22:30:00+09:00") });
  await openApp(page, "/settings");

  // 目標を1時間に
  for (let i = 0; i < 26; i++) await page.getByRole("button", { name: "目標時間を30分減らす" }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました")).toBeVisible();

  await page.getByRole("link", { name: "時間" }).click();
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.locator(".kv")).toContainText("22:30");
  await expect(page.locator(".kv")).toContainText("23:30ごろ"); // 終了予定 = 開始 + 残り1時間

  await page.clock.fastForward(40 * 60_000);
  await expect(page.locator(".ring-big")).toHaveText("20分");
  await expect(page.locator(".today-total")).toContainText("40分");

  await page.clock.fastForward(21 * 60_000); // 23:31 → 目標達成
  await expect(page.locator(".ring-inner")).toContainText("今日の目標達成！");
  await expect(page.locator(".celebrate-card")).toContainText("よくできました！");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notes: string[] }).__notes)).toEqual([
    "きょうせいタイム|目標の装着時間になりました！\nよくがんばりました！",
  ]);

  // さらに装着を続けても同じ日には再通知しない。超過分も表示
  await page.clock.fastForward(10 * 60_000); // 23:41
  await expect(page.locator(".ring-over")).toHaveText("+11分");
  expect(await page.evaluate(() => (window as unknown as { __notes: string[] }).__notes.length)).toBe(1);

  // 日付をまたぐ: 10/8 00:30 → 今日の装着は 0:00 からの30分だけ
  await page.clock.fastForward(49 * 60_000);
  await expect(page.locator(".today-total")).toContainText("30分");
  await expect(page.locator(".ring-big")).toHaveText("30分");
  await expect(page.locator(".session-row.active")).toContainText("前日 22:30");

  await page.getByRole("button", { name: "装着終了" }).click();
  await expect(page.getByText("現在：外しています")).toBeVisible();

  // カレンダー: 10/7 は約1時間30分で達成、10/8 は30分で未達成 (仮想時計はページ読み込み中も数秒進む)
  await page.getByRole("link", { name: "カレンダー" }).click();
  await expect(page.getByRole("button", { name: /^10月7日 目標達成 1時間(29|30)分/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^10月8日 今日 未達成 30分/ })).toBeVisible();
  await page.getByRole("button", { name: /^10月7日/ }).click();
  await expect(page.locator(".detail-card")).toContainText("翌00:30");

  // 再読み込みしても同じ (保存した開始・終了時刻から再計算)
  await page.reload();
  await expect(page.getByRole("button", { name: /^10月8日 今日 未達成 30分/ })).toBeVisible();
});

test("仮想時計: タブを閉じている間も装着時間は進む (startTime から再計算)", async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-10-07T08:00:00+09:00") });
  await openApp(page, "/");
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await page.close();

  // 3時間後に開き直す (この間 JS は一切動いていない)
  const p2 = await context.newPage();
  await p2.clock.install({ time: new Date("2026-10-07T11:00:00+09:00") });
  await openApp(p2, "/");
  await expect(p2.getByText("現在：装着中")).toBeVisible();
  await expect(p2.locator(".today-total")).toContainText("3時間00分");
  await expect(p2.locator(".kv")).toContainText("3時間00分"); // 経過時間
  await expect(p2.locator(".ring-big")).toHaveText("11時間00分");
});
