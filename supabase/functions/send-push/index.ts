// Supabase Edge Function (Deno): 1分ごとに呼ばれ、送信時刻を過ぎた通知を Web Push で送る。
// デプロイ: supabase functions deploy send-push --no-verify-jwt
// 必要な secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:...) / CRON_SECRET
// (SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で設定)
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { runPush, type ScheduleRow, type SubscriptionRow } from "./core.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`${k} が設定されていません`);
  return v;
};

webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) return new Response("forbidden", { status: 403 });
  const result = await runPush({
    async dueSchedules(nowIso) {
      const { data, error } = await db.from("push_schedules").select("*").not("send_at", "is", null).lte("send_at", nowIso).limit(500);
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
    async subscriptionsFor(userId) {
      const { data, error } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as SubscriptionRow[];
    },
    async send(sub, payload) {
      try {
        const r = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: "high" });
        return r.statusCode;
      } catch (e) {
        return (e as { statusCode?: number }).statusCode ?? 500;
      }
    },
    async deleteSubscription(id) {
      await db.from("push_subscriptions").delete().eq("id", id);
    },
    async markSent(row, next, sentAt) {
      // 送っている間にアプリが予定を更新していたら上書きしない (send_at が同じときだけ)
      await db
        .from("push_schedules")
        .update({ send_at: next, last_sent_at: sentAt })
        .eq("child_id", row.child_id)
        .eq("kind", row.kind)
        .eq("send_at", row.send_at);
    },
  });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
});
