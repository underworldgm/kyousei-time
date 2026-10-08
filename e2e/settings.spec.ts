import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

/** 通知の呼び出しを記録 (ヘッドレスは通知許可が無いので「許可済み」を再現) */
const spyNotifications = () => {
  const w = window as unknown as { __notes: { title: string; body: string; silent: boolean }[] };
  w.__notes = [];
  ServiceWorkerRegistration.prototype.showNotification = function (title: string, opts?: NotificationOptions) {
    w.__notes.push({ title, body: opts?.body ?? "", silent: !!opts?.silent });
    return Promise.resolve();
  };
  const N = window.Notification;
  class Spy extends N {
    constructor(title: string, opts?: NotificationOptions) {
      super(title, opts);
      w.__notes.push({ title, body: opts?.body ?? "", silent: !!opts?.silent });
    }
  }
  Object.defineProperty(Spy, "permission", { get: () => "granted" });
  Object.defineProperty(Spy, "requestPermission", { value: async () => "granted" });
  (window as unknown as { Notification: typeof Notification }).Notification = Spy as unknown as typeof Notification;
};
const notes = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __notes: { body: string; silent: boolean }[] }).__notes);

test("目標時間は30分単位で設定できる", async ({ page }) => {
  await openApp(page, "/settings");
  await page.getByRole("button", { name: "目標時間を30分増やす" }).click();
  await expect(page.locator(".step-val")).toContainText("14");
  await expect(page.locator(".step-val")).toContainText("30分");
  await expect(page.getByText("未保存の変更があります")).toBeVisible();
  await page.getByRole("button", { name: "保存する" }).click();
  await page.getByRole("link", { name: "時間" }).click();
  await expect(page.locator(".goal-chip")).toContainText("14時間30分");
  await expect(page.locator(".ring-big")).toHaveText("14時間30分");
});

test("リマインダー: 設定した時刻に未達成なら1回だけ通知 (音なし設定も反映)", async ({ page }) => {
  await page.addInitScript(spyNotifications);
  await page.clock.install({ time: new Date("2026-10-07T19:58:00+09:00") });
  await openApp(page, "/settings");
  await page.getByRole("switch", { name: "リマインダー" }).check();
  await page.getByLabel("リマインダーの時刻").fill("20:00");
  await page.getByRole("switch", { name: "通知音" }).uncheck();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました")).toBeVisible();
  expect(await notes(page)).toEqual([]);

  await page.clock.fastForward(3 * 60_000); // 20:01
  await expect.poll(() => notes(page)).toHaveLength(1);
  const [n] = await notes(page);
  expect(n.body).toContain("今日の装着はあと14時間00分");
  expect(n.silent).toBe(true);

  await page.clock.fastForward(30 * 60_000);
  await page.reload();
  await page.waitForTimeout(500);
  expect(await notes(page)).toHaveLength(0); // 再読み込み後も同じ日には再通知しない (記録は IndexedDB)
});

test("ためしに通知できる", async ({ page }) => {
  await page.addInitScript(spyNotifications);
  await openApp(page, "/settings");
  await page.getByRole("button", { name: "ためしに通知する" }).click();
  await expect(page.getByText("通知を送りました")).toBeVisible();
  expect((await notes(page))[0].body).toContain("ためしの通知");
});

test("子どもを追加して切り替えると、記録はそれぞれ別になる", async ({ page }) => {
  await openApp(page, "/settings");
  await page.getByLabel("名前（ニックネーム）").fill("みな");
  await page.getByRole("button", { name: "保存する" }).click();
  await page.getByRole("link", { name: "時間" }).click();
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.getByText("現在：装着中")).toBeVisible();

  await page.getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "＋ 子どもを追加する" }).click();
  await page.getByLabel("追加する子の名前").fill("そうた");
  await page.getByRole("radio", { name: "追加する子のアイコン 🐻" }).click();
  await page.getByRole("button", { name: "追加する", exact: true }).click();
  await expect(page.locator(".hero-sub")).toContainText("そうたの");

  await page.getByRole("link", { name: "時間" }).click();
  await expect(page.getByText("現在：外しています")).toBeVisible(); // そうたは別の記録

  // ヘッダーで みな に戻す
  await page.getByLabel("表示する子どもを切り替える").selectOption({ label: "🦷 みな" });
  await expect(page.locator(".hero-sub")).toContainText("みなの");
  await expect(page.getByText("現在：装着中")).toBeVisible();
  await page.reload();
  await expect(page.locator(".hero-sub")).toContainText("みなの"); // 選択は端末に保存
});
