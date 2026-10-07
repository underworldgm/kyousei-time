import type { BrowserContext, Route } from "@playwright/test";

/**
 * Supabase (GoTrue + PostgREST) の最小モック。複数のブラウザコンテキスト (= 複数端末) で同じサーバー状態を共有する。
 * サーバー側の LWW トリガー・synced_at・RLS (user_id 一致) も再現する。
 */
export class MockSupabase {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  clock = 0;
  online = true;
  requests: string[] = [];

  constructor(public uid: string, public email = "parent@example.com") {}

  /** マジックリンクで戻ってきたときの URL ハッシュ (implicit フロー) */
  magicLinkHash(): string {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return `#access_token=tok-${this.uid}&expires_at=${exp}&expires_in=3600&refresh_token=ref-${this.uid}&token_type=bearer&type=magiclink`;
  }

  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  rows(name: string) {
    return [...this.table(name).values()];
  }

  async attach(context: BrowserContext) {
    await context.route("https://mock-project.supabase.co/**", (route) => this.handle(route));
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        // Authorization はワイルドカードに含まれないので明示する
        "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, x-supabase-api-version",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      },
      body: body === undefined ? "" : JSON.stringify(body),
    });
  }

  private user() {
    return { id: this.uid, aud: "authenticated", role: "authenticated", email: this.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    this.requests.push(`${req.method()} ${url.pathname}`);
    if (req.method() === "OPTIONS") return this.json(route, 204, undefined);
    if (!this.online) return route.abort("internetdisconnected");

    if (url.pathname === "/auth/v1/user") return this.json(route, 200, this.user());
    if (url.pathname === "/auth/v1/token") {
      return this.json(route, 200, { access_token: `tok-${this.uid}`, refresh_token: `ref-${this.uid}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: this.user() });
    }
    if (url.pathname === "/auth/v1/logout") return this.json(route, 204, undefined);
    if (url.pathname === "/auth/v1/otp") return this.json(route, 200, {});

    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return this.json(route, 404, { message: "not found" });
    const auth = req.headers()["authorization"] ?? "";
    if (auth !== `Bearer tok-${this.uid}`) return this.json(route, 401, { message: "JWT required" });
    const t = this.table(m[1]);

    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "[]");
      for (const row of Array.isArray(body) ? body : [body]) {
        if (row.user_id !== this.uid) return this.json(route, 403, { message: "new row violates row-level security policy" });
        const old = t.get(row.id);
        if (old && Date.parse(row.updated_at) < Date.parse(old.updated_at as string)) continue; // LWW
        // PostgREST は "+00:00" 形式でマイクロ秒を返す
        this.clock++;
        const synced = new Date(Date.UTC(2030, 0, 1) + this.clock * 1000).toISOString().replace("Z", "+00:00");
        t.set(row.id, { ...row, synced_at: synced });
      }
      return this.json(route, 201, undefined);
    }
    if (req.method() === "GET") {
      const p = url.searchParams;
      const userEq = p.get("user_id")?.replace(/^eq\./, "");
      const gte = p.get("synced_at")?.replace(/^gte\./, "");
      const rows = [...t.values()]
        .filter((r) => r.user_id === this.uid && r.user_id === userEq)
        .filter((r) => !gte || Date.parse(r.synced_at as string) >= Date.parse(gte))
        .sort((a, b) => Date.parse(a.synced_at as string) - Date.parse(b.synced_at as string))
        .slice(0, Number(p.get("limit") ?? 1000));
      return this.json(route, 200, rows);
    }
    return this.json(route, 405, { message: "method not allowed" });
  }
}
