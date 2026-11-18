import { expect, test, type Page } from "@playwright/test";
import { MockSupabase } from "../e2e/mockSupabase";

const UID = "5a5a5a5a-1111-4222-8333-444455556666";

async function login(page: Page, server: MockSupabase) {
  // メールのマジックリンクを開く = リダイレクト先 (トップ = 時間画面) が新しく読み込まれる
  await page.goto("about:blank");
  await page.goto("/" + server.magicLinkHash());
  await expect(page.locator(".sync-badge")).toContainText("同期済み", { timeout: 15_000 });
}

test("2台の端末: ログイン → 記録 → もう1台に同期 → 削除は復活しない", async ({ browser }) => {
  const server = new MockSupabase(UID);

  // 端末A: ログイン前にオフライン利用していた記録がある
  const a = await browser.newContext();
  await server.attach(a);
  const pa = await a.newPage();
  await pa.goto("/");
  await expect(pa.locator(".sync-badge")).toContainText("この端末に保存");
  await pa.getByRole("link", { name: "設定" }).click();
  await pa.getByLabel("名前（ニックネーム）").fill("みな");
  for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "目標時間を30分減らす" }).click();
  await pa.getByRole("button", { name: "保存する" }).click();
  await expect(pa.getByText("保存しました")).toBeVisible();
  await pa.getByRole("link", { name: "時間" }).click();
  await pa.getByRole("button", { name: "装着開始" }).click();
  await expect(pa.getByText("現在：装着中")).toBeVisible();

  await login(pa, server);
  await expect.poll(() => server.rows("wear_sessions").length).toBe(1);
  expect(server.rows("wear_sessions")[0]).toMatchObject({ user_id: UID, child_id: UID, end_time: null });
  expect(server.rows("settings")[0]).toMatchObject({ daily_target_minutes: 780 });
  expect(server.rows("children")[0]).toMatchObject({ name: "みな" });

  // 端末B: 新しい端末でログイン → 装着中の状態・設定・名前が届く
  const b = await browser.newContext();
  await server.attach(b);
  const pb = await b.newPage();
  await login(pb, server);
  await expect(pb.getByText("現在：装着中")).toBeVisible();
  await expect(pb.locator(".goal-chip")).toContainText("13時間");
  await expect(pb.locator(".hero-sub")).toContainText("みなの");

  // 端末Bで終了 → 端末Aに反映 (フォーカス復帰で同期)
  await pb.getByRole("button", { name: "装着終了" }).click();
  await expect.poll(() => server.rows("wear_sessions")[0].end_time !== null || server.rows("wear_sessions")[0].deleted_at !== null).toBe(true);
  await pa.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(pa.getByText("現在：外しています")).toBeVisible({ timeout: 15_000 });

  // 端末Aで手動追加 → B へ。B で削除 → A でも消え、A の再同期で復活しない
  await pa.getByRole("button", { name: "記録を追加する" }).click();
  const dlg = pa.locator("dialog[open]");
  await dlg.getByLabel("開始日").fill("2026-01-05");
  await dlg.getByLabel("開始時刻").fill("08:00");
  await dlg.getByLabel("終了日").fill("2026-01-05");
  await dlg.getByLabel("終了時刻").fill("10:30");
  await dlg.getByRole("button", { name: "追加する" }).click();
  await expect.poll(() => server.rows("wear_sessions").filter((r) => !r.deleted_at).length).toBeGreaterThanOrEqual(1);
  const added = () => server.rows("wear_sessions").find((r) => String(r.start_time).startsWith("2026-01-04T23:00"));
  await expect.poll(() => !!added()).toBe(true);

  await pb.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await pb.getByRole("link", { name: "カレンダー" }).click();
  // 2026年1月へ移動して 5日 を選択
  const target = pb.getByRole("heading", { name: "2026年1月" });
  for (let i = 0; i < 24 && !(await target.isVisible()); i++) await pb.getByRole("button", { name: "前の月" }).click();
  await pb.getByRole("button", { name: /^1月5日/ }).click();
  await expect(pb.locator(".detail-card")).toContainText("2時間30分");
  await pb.locator(".detail-card .session-row").getByRole("button", { name: /削除/ }).click();
  await pb.getByRole("button", { name: "削除する" }).click();
  await expect.poll(() => added()?.deleted_at ?? null).not.toBeNull();

  await pa.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await pa.getByRole("link", { name: "カレンダー" }).click();
  for (let i = 0; i < 24 && !(await pa.getByRole("heading", { name: "2026年1月" }).isVisible()); i++) await pa.getByRole("button", { name: "前の月" }).click();
  await pa.getByRole("button", { name: /^1月5日/ }).click();
  await expect(pa.locator(".detail-card")).toContainText("この日の記録はありません", { timeout: 15_000 });
  await pa.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await pa.waitForTimeout(1500);
  expect(added()?.deleted_at).not.toBeNull();
  await expect(pa.locator(".detail-card")).toContainText("この日の記録はありません");
});

test("オフライン中の操作はキューに残り、復帰後に送信される", async ({ browser }) => {
  const server = new MockSupabase("6b6b6b6b-1111-4222-8333-444455556666");
  const ctx = await browser.newContext();
  await server.attach(ctx);
  const page = await ctx.newPage();
  await login(page, server);

  server.online = false;
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.locator(".sync-badge")).toContainText("オフライン");
  await expect(page.locator(".sync-badge")).toContainText("同期待ち");
  expect(server.rows("wear_sessions")).toHaveLength(0);

  server.online = true;
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => server.rows("wear_sessions").length, { timeout: 15_000 }).toBe(1);
  await expect(page.locator(".sync-badge")).toContainText("同期済み", { timeout: 15_000 });
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByText("クラウドにバックアップ済み")).toBeVisible();
});

test("サーバー停止中は同期エラーを表示し、記録は端末に残る", async ({ browser }) => {
  const server = new MockSupabase("7c7c7c7c-1111-4222-8333-444455556666");
  const ctx = await browser.newContext();
  await server.attach(ctx);
  const page = await ctx.newPage();
  await login(page, server);
  server.online = false; // ネットはつながるが Supabase が応答しない
  await page.getByRole("button", { name: "装着開始" }).click();
  await expect(page.locator(".sync-badge")).toContainText("同期エラー", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByText("現在：装着中")).toBeVisible();
  server.online = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => server.rows("wear_sessions").length, { timeout: 15_000 }).toBe(1);
});

test("クラウド通知: 装着開始で目標達成の予定が送られ、外すと取り消される", async ({ browser }) => {
  const server = new MockSupabase("8d8d8d8d-1111-4222-8333-444455556666");
  const ctx = await browser.newContext();
  await server.attach(ctx);
  const page = await ctx.newPage();
  await login(page, server);
  // ヘッドレスでは実際の Push 購読はできないため、この端末で有効にした状態を再現する
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("kyousei-time");
        req.onsuccess = () => {
          const tx = req.result.transaction("meta", "readwrite");
          tx.objectStore("meta").put({ key: "pushEnabled", value: true });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const goal = () => server.rows("push_schedules").find((r) => r.kind === "goal");
  await expect.poll(() => !!goal()).toBe(true);
  expect(goal()!.send_at).toBeNull(); // 外している間は送らない

  await page.getByRole("button", { name: "装着開始" }).click();
  await expect.poll(() => goal()?.send_at ?? null, { timeout: 10_000 }).not.toBeNull();
  const eta = Date.parse(goal()!.send_at as string);
  expect(Math.abs(eta - (Date.now() + 14 * 3600_000))).toBeLessThan(5 * 60_000); // 今 + 14時間
  expect(goal()!.body).toContain("目標の装着時間になりました");

  // 1分未満の装着は記録しないので、開始時刻を1時間前に直してから外す
  const d = new Date(Date.now() + 9 * 3600_000 - 3600_000);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  await page.locator(".session-row.active").getByRole("button", { name: /編集/ }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("開始日").fill(d.toISOString().slice(0, 10));
  await dlg.getByLabel("開始時刻").fill(hm);
  await dlg.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => Date.parse((goal()?.send_at as string) ?? "0"), { timeout: 10_000 }).toBeLessThan(eta - 50 * 60_000); // 予定も1時間早まる
  await page.getByRole("button", { name: "装着終了" }).click();
  await expect.poll(() => goal()?.send_at === null, { timeout: 10_000 }).toBe(true);
  const rem = server.rows("push_schedules").find((r) => r.kind === "reminder");
  expect(rem?.send_at).toBeNull(); // リマインダーは初期設定でオフ
});
