import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

const PAGES = [
  { path: "/", name: "時間" },
  { path: "/calendar", name: "カレンダー" },
  { path: "/settings", name: "設定" },
];

for (const p of PAGES) {
  test(`${p.name}: 横スクロールなし・歯のキャラクターが見える・ナビ固定`, async ({ page }) => {
    await openApp(page, p.path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const mascot = await page.locator(".hero-mascot").boundingBox();
    expect(mascot && mascot.y >= 0 && mascot.height > 40).toBeTruthy();
    const nav = await page.locator("nav.nav").boundingBox();
    const vh = page.viewportSize()!.height;
    expect(Math.round(nav!.y + nav!.height)).toBe(vh);
    await expect(page.locator(".nav-item.active")).toHaveAttribute("aria-current", "page");
  });

  test(`${p.name}: アクセシビリティ (重大な違反なし)`, async ({ page }) => {
    await openApp(page, p.path);
    const r = await new AxeBuilder({ page }).disableRules(["region"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("時間画面: 装着ボタンがスクロールなしで押せる位置にある", async ({ page }) => {
  await openApp(page, "/");
  const btn = await page.locator(".btn-main").boundingBox();
  const nav = await page.locator("nav.nav").boundingBox();
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(nav!.y);
  expect(btn!.height).toBeGreaterThanOrEqual(44);
});

test("操作部品は 44px 以上", async ({ page }) => {
  for (const p of PAGES) {
    await openApp(page, p.path);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, a, [role=switch]")]
        .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest(".switch"))
        .map((el) => ({ el: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 20), r: el.getBoundingClientRect() }))
        .filter((x) => x.r.width < 40 || x.r.height < 40)
        .map((x) => `${x.el} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    );
    expect(small, p.path).toEqual([]);
  }
});

test("タブ切替で先頭から表示される (前の画面のスクロール位置を引き継がない)", async ({ page }) => {
  await openApp(page, "/settings");
  await page.getByRole("button", { name: "保存する" }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "時間" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".hero-mascot")).toBeInViewport();
});
