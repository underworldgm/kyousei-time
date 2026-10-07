import { useEffect, useState } from "react";
import { useAppData } from "../app/AppData";
import { Hero } from "../components/Hero";
import { useAuth } from "../hooks/useAuth";
import { useInstall } from "../hooks/useInstall";
import { useSyncState } from "../hooks/useSyncState";
import { clearSampleData, importIntervals, saveChild, saveSettings, seedSampleData } from "../db/repo";
import { parseSessionsCsv } from "../lib/csv";
import { cloudConfigured } from "../lib/supabase";
import { ensurePermission, permissionState } from "../lib/notifications";
import { requestSync } from "../lib/sync";
import { fmtDuration, jstHM, sessionsToCsv, dayKeyOf } from "../lib/time";

const ICONS = ["🦷", "🌟", "🐰", "🐱", "🐻"];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="switch-text" aria-hidden="true">
        {checked ? "ON" : "OFF"}
      </span>
    </label>
  );
}

export function SettingsPage() {
  const { settings, child, sessions, now, targetMinutes, targetFor, identity } = useAppData();
  const [minutes, setMinutes] = useState(settings?.dailyTargetMinutes ?? targetMinutes);
  const [notify, setNotify] = useState(true);
  const [stamp, setStamp] = useState(true);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🦷");
  const [saved, setSaved] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const sync = useSyncState();
  const auth = useAuth();
  const install = useInstall();

  useEffect(() => {
    if (!settings) return;
    setMinutes(settings.dailyTargetMinutes);
    setNotify(settings.notificationsEnabled);
    setStamp(settings.rewardStampEnabled);
  }, [settings?.id, settings?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (child) {
      setName(child.name);
      setIcon(child.icon);
    }
  }, [child?.id, child?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const step = (d: number) => setMinutes((m) => Math.min(24 * 60, Math.max(60, m + d * 60)));

  const toggleNotify = async (v: boolean) => {
    setNotify(v);
    setNotifyMsg(null);
    if (v) {
      const p = await ensurePermission();
      if (p === "denied") setNotifyMsg("ブラウザで通知がブロックされています。端末の設定から許可してください。");
      else if (p === "unsupported") setNotifyMsg("この端末・ブラウザでは通知を使えません。画面内のお知らせで代用されます。");
    }
  };

  const save = async () => {
    try {
      await saveSettings({ dailyTargetMinutes: minutes, notificationsEnabled: notify, rewardStampEnabled: stamp });
      if (child && (name.trim() !== child.name || icon !== child.icon)) await saveChild({ name: name.trim(), icon });
      setSaved("保存しました");
    } catch {
      setSaved("保存できませんでした");
    }
    setTimeout(() => setSaved(null), 2500);
  };

  const exportCsv = () => {
    const csv = sessionsToCsv(sessions, targetFor, Date.now());
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kyousei-time-${dayKeyOf(Date.now())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setImportMsg(null);
    try {
      const { intervals, invalidLines } = parseSessionsCsv(await file.text());
      const r = await importIntervals(intervals);
      const parts = [`${r.added}件を追加しました`];
      if (r.duplicates) parts.push(`${r.duplicates}件は同じ記録があるため省略`);
      if (r.skipped) parts.push(`${r.skipped}件は既存の記録と重なる・時刻が正しくないため省略`);
      if (invalidLines.length) parts.push(`読めない行: ${invalidLines.slice(0, 5).join(", ")}${invalidLines.length > 5 ? " ほか" : ""}`);
      setImportMsg(parts.join(" / "));
    } catch {
      setImportMsg("ファイルを読み込めませんでした");
    }
  };

  const dirty =
    !!settings &&
    (minutes !== settings.dailyTargetMinutes ||
      notify !== settings.notificationsEnabled ||
      stamp !== settings.rewardStampEnabled ||
      (!!child && (name.trim() !== child.name || icon !== child.icon)));

  const perm = permissionState();
  const backedUp = sync.phase === "idle" && sync.pending === 0 && !!sync.lastSyncedAt;
  const signedIn = !!auth.session;

  return (
    <>
      <Hero childName={child?.name ?? ""} childIcon={child?.icon} />
      <main className="page settings-page">
        <h2 className="page-title">設定</h2>

        <section className="card" aria-labelledby="goal-title">
          <div className="card-head">
            <span className="bubble mint" aria-hidden="true">⏱</span>
            <h3 id="goal-title">1日の装着目標</h3>
          </div>
          <div className="stepper" role="group" aria-label="目標時間">
            <button type="button" className="step-btn" onClick={() => step(-1)} disabled={minutes <= 60} aria-label="目標時間を1時間減らす">
              −
            </button>
            <output className="step-val" aria-live="polite">
              <span className="num">{hours}</span>
              <span className="unit">時間{rest ? ` ${rest}分` : ""}</span>
            </output>
            <button type="button" className="step-btn" onClick={() => step(1)} disabled={minutes >= 24 * 60} aria-label="目標時間を1時間増やす">
              ＋
            </button>
          </div>
          <p className="hint center">毎日つける目標時間を設定します</p>
          <p className="hint center small">装着時間は歯科医院から指示された時間を設定してください。</p>
        </section>

        <section className="card row-card" aria-label="通知">
          <span className="bubble sky" aria-hidden="true">🔔</span>
          <div className="row-text">
            <h3>通知</h3>
            <p>終了時間になったらお知らせ</p>
          </div>
          <Switch checked={notify} onChange={(v) => void toggleNotify(v)} label="通知" />
          {(notifyMsg || (notify && perm === "default")) && <p className="hint full">{notifyMsg ?? "オンにすると、ブラウザの通知許可を求めます。"}</p>}
        </section>

        <section className="card row-card" aria-label="ごほうびスタンプ">
          <span className="bubble pink" aria-hidden="true">⭐</span>
          <div className="row-text">
            <h3>ごほうびスタンプ</h3>
            <p>目標達成でカレンダーに○スタンプ</p>
          </div>
          <Switch checked={stamp} onChange={setStamp} label="ごほうびスタンプ" />
        </section>

        <section className="card" aria-labelledby="child-title">
          <div className="card-head">
            <span className="bubble yellow" aria-hidden="true">🧒</span>
            <h3 id="child-title">お子さま</h3>
          </div>
          <label className="field">
            <span>名前（ニックネーム）</span>
            <input type="text" value={name} maxLength={12} placeholder="例: みなちゃん" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="icon-pick" role="radiogroup" aria-label="アイコン">
            {ICONS.map((ic) => (
              <button key={ic} type="button" role="radio" aria-checked={icon === ic} className={icon === ic ? "on" : ""} onClick={() => setIcon(ic)} aria-label={`アイコン ${ic}`}>
                {ic}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="btn-main start save" onClick={() => void save()}>
          <span className="btn-glyph" aria-hidden="true">✓</span> 保存する
        </button>
        <p className={`saved${!saved && dirty ? " dirty" : ""}`} role="status">
          {saved ?? (dirty ? "未保存の変更があります" : "")}
        </p>

        <section className="card" aria-labelledby="sync-title">
          <div className="card-head">
            <span className="bubble sky" aria-hidden="true">☁</span>
            <h3 id="sync-title">バックアップと同期</h3>
          </div>
          <p className={`backup ${backedUp ? "ok" : ""}`}>
            {!cloudConfigured
              ? "この端末に保存済み（クラウド同期は未設定）"
              : !signedIn
                ? "この端末に保存済み（ログインするとクラウドに保存されます）"
                : backedUp
                  ? "✓ クラウドにバックアップ済み"
                  : sync.phase === "error"
                    ? "! 同期エラー。この端末には保存済みです。あとで自動で再試行します"
                    : !sync.online
                      ? "この端末に保存済み・クラウド同期待ち（オフライン）"
                      : sync.pending
                        ? `この端末に保存済み・クラウド同期待ち ${sync.pending}件`
                        : "同期中…"}
          </p>
          {sync.lastSyncedAt && <p className="hint">最終同期 {jstHM(Date.parse(sync.lastSyncedAt))}</p>}
          {sync.error && <p className="form-error">⚠ {sync.error}</p>}
          {cloudConfigured && !signedIn && (
            <form
              className="login"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) void auth.signIn(email.trim());
              }}
            >
              <label className="field">
                <span>メールでログイン (Magic Link)</span>
                <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" className="btn mint wide" disabled={auth.busy}>
                ログイン用リンクを送る
              </button>
            </form>
          )}
          {auth.message && <p className="hint" role="status">{auth.message}</p>}
          {signedIn && (
            <div className="signed">
              <p className="hint">ログイン中: {auth.session?.user.email}</p>
              <div className="btn-row">
                <button type="button" className="btn outline" onClick={() => requestSync(0)}>今すぐ同期</button>
                <button type="button" className="btn outline" onClick={() => void auth.signOut()}>ログアウト</button>
              </div>
            </div>
          )}
          <p className="hint small">ユーザーID: {identity.authenticated ? "ログイン中" : "local-user"}</p>
        </section>

        <section className="card" aria-labelledby="data-title">
          <div className="card-head">
            <span className="bubble mint" aria-hidden="true">📄</span>
            <h3 id="data-title">データ</h3>
          </div>
          <p className="hint">記録をCSVで保存・復元できます（歯科医院への共有・機種変更・バックアップ用）。復元では、すでにある記録と重なるものは追加しません。</p>
          <button type="button" className="btn outline wide" onClick={exportCsv} disabled={!sessions.length}>
            CSVを書き出す
          </button>
          <label className="btn outline wide file-btn">
            CSVから復元する
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                void importCsv(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {importMsg && (
            <p className="hint" role="status">
              {importMsg}
            </p>
          )}
          <p className="hint small">現在の記録: {sessions.length}件 / 目標 {fmtDuration(targetMinutes, { short: true })}</p>
        </section>

        {install.kind && (
          <section className="card" aria-labelledby="install-title">
            <h3 id="install-title">ホーム画面に追加</h3>
            {install.kind === "ios" ? <p className="hint">Safari の「共有」→「ホーム画面に追加」を押してください。</p> : <p className="hint">アプリのように起動できます。</p>}
            {install.kind === "native" && (
              <button type="button" className="btn mint wide" onClick={() => void install.install()}>
                ホーム画面に追加
              </button>
            )}
          </section>
        )}

        {import.meta.env.DEV && (
          <section className="card dev" aria-labelledby="dev-title">
            <h3 id="dev-title">開発用 (本番では表示されません)</h3>
            <div className="btn-row">
              <button type="button" className="btn outline" onClick={() => void seedSampleData(dayKeyOf(now))}>サンプル投入</button>
              <button type="button" className="btn outline" onClick={() => void clearSampleData()}>サンプル削除</button>
            </div>
          </section>
        )}
        <p className="disclaimer">このアプリは医療診断を行うものではありません。目標時間は歯科医師の指示にしたがってください。</p>
      </main>
    </>
  );
}
