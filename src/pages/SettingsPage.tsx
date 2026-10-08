import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "../app/AppData";
import { Hero } from "../components/Hero";
import { RewardStamp, STAMP_KINDS, STAMP_NAMES } from "../components/RewardStamp";
import { useAuth } from "../hooks/useAuth";
import { useInstall } from "../hooks/useInstall";
import { useSyncState } from "../hooks/useSyncState";
import { addChild, clearSampleData, importIntervals, saveChild, saveSettings, seedSampleData, switchChild, withSettingDefaults } from "../db/repo";
import { parseSessionsCsv } from "../lib/csv";
import { cloudConfigured } from "../lib/supabase";
import { ensurePermission, permissionState, showNotification } from "../lib/notifications";
import { disablePush, enablePush, pushConfigured } from "../lib/push";
import { getMeta, setMeta } from "../db/indexedDb";
import { requestSync } from "../lib/sync";
import { fmtDuration, jstHM, sessionsToCsv, dayKeyOf } from "../lib/time";

const ICONS = ["🦷", "🌟", "🐰", "🐱", "🐻"];

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`switch${disabled ? " disabled" : ""}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
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
  const { settings, child, children, sessions, now, targetMinutes, targetFor, identity } = useAppData();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("🐻");
  const [minutes, setMinutes] = useState(settings?.dailyTargetMinutes ?? targetMinutes);
  const [notify, setNotify] = useState(true);
  const [stamp, setStamp] = useState(true);
  const [reminder, setReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [sound, setSound] = useState(true);
  const [badge, setBadge] = useState(true);
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
    const st = withSettingDefaults(settings);
    setMinutes(st.dailyTargetMinutes);
    setNotify(st.notificationsEnabled);
    setStamp(st.rewardStampEnabled);
    setReminder(st.reminderEnabled);
    setReminderTime(st.reminderTime);
    setSound(st.notificationSound);
    setBadge(st.badgeEnabled);
  }, [settings?.id, settings?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (child) {
      setName(child.name);
      setIcon(child.icon);
    }
  }, [child?.id, child?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  // 30分単位 (1〜24時間)
  const step = (d: number) => setMinutes((m) => Math.min(24 * 60, Math.max(60, Math.round((m + d * 30) / 30) * 30)));

  const toggleNotify = async (v: boolean) => {
    setNotify(v);
    setNotifyMsg(null);
    if (v) {
      const p = await ensurePermission();
      if (p === "denied") setNotifyMsg("ブラウザで通知がブロックされています。端末の設定から許可してください。");
      else if (p === "unsupported") setNotifyMsg("この端末・ブラウザでは通知を使えません。画面内のお知らせで代用されます。");
    }
  };

  const toggleReminder = async (v: boolean) => {
    setReminder(v);
    setNotifyMsg(null);
    if (v) {
      const p = await ensurePermission();
      if (p === "denied") setNotifyMsg("ブラウザで通知がブロックされています。端末の設定から許可してください。");
    }
  };

  const testNotify = async () => {
    const p = await ensurePermission();
    if (p !== "granted") {
      setNotifyMsg(p === "unsupported" ? "この端末・ブラウザでは通知を使えません。" : "通知が許可されていません。ブラウザや端末の設定から許可してください。");
      return;
    }
    const ok = await showNotification("きょうせいタイム", "これは ためしの通知です。", "test", { sound });
    setNotifyMsg(ok ? "通知を送りました。届いたか確認してください。" : "通知を表示できませんでした。");
  };

  const [pushOn, setPushOn] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  useEffect(() => {
    void getMeta<boolean>("pushEnabled").then((v) => setPushOn(!!v)).catch(() => undefined);
  }, []);
  const togglePush = async (v: boolean) => {
    setPushMsg(null);
    if (v) {
      if (!auth.session) return;
      const r = await enablePush(auth.session.user.id);
      if (!r.ok) {
        setPushMsg(r.error);
        return;
      }
      await setMeta("pushEnabled", true);
      setPushOn(true);
      setPushMsg("この端末にクラウド通知を届けます。");
    } else {
      await disablePush();
      await setMeta("pushEnabled", false);
      setPushOn(false);
    }
  };

  const badgeSupported = typeof navigator !== "undefined" && "setAppBadge" in navigator;

  const save = async () => {
    try {
      await saveSettings({
        dailyTargetMinutes: minutes,
        notificationsEnabled: notify,
        rewardStampEnabled: stamp,
        reminderEnabled: reminder,
        reminderTime,
        notificationSound: sound,
        badgeEnabled: badge,
      });
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
      reminder !== withSettingDefaults(settings).reminderEnabled ||
      reminderTime !== withSettingDefaults(settings).reminderTime ||
      sound !== withSettingDefaults(settings).notificationSound ||
      badge !== withSettingDefaults(settings).badgeEnabled ||
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
            <button type="button" className="step-btn" onClick={() => step(-1)} disabled={minutes <= 60} aria-label="目標時間を30分減らす">
              −
            </button>
            <output className="step-val" aria-live="polite">
              <span className="num">{hours}</span>
              <span className="unit">時間{rest ? <strong className="unit-min"> {rest}分</strong> : ""}</span>
            </output>
            <button type="button" className="step-btn" onClick={() => step(1)} disabled={minutes >= 24 * 60} aria-label="目標時間を30分増やす">
              ＋
            </button>
          </div>
          <p className="hint center">毎日つける目標時間を設定します</p>
          <p className="hint center small">装着時間は歯科医院から指示された時間を設定してください。</p>
        </section>

        <section className="card notify-card" aria-labelledby="notify-title">
          <div className="card-head">
            <span className="bubble sky" aria-hidden="true">🔔</span>
            <h3 id="notify-title">通知の設定</h3>
          </div>
          <div className="setting-row">
            <div className="row-text">
              <h4>目標達成の通知</h4>
              <p>終了予定の時刻になったらお知らせ</p>
            </div>
            <Switch checked={notify} onChange={(v) => void toggleNotify(v)} label="目標達成の通知" />
          </div>
          <div className="setting-row">
            <div className="row-text">
              <h4>リマインダー</h4>
              <p>毎日この時刻に、まだ目標に届いていなければお知らせ</p>
            </div>
            <Switch checked={reminder} onChange={(v) => void toggleReminder(v)} label="リマインダー" />
            <label className="time-field">
              <span>時刻</span>
              <input type="time" value={reminderTime} disabled={!reminder} onChange={(e) => setReminderTime(e.target.value)} aria-label="リマインダーの時刻" />
            </label>
          </div>
          <div className="setting-row">
            <div className="row-text">
              <h4>通知音</h4>
              <p>{sound ? "端末の通知音を鳴らします" : "音を鳴らさずにお知らせします"}</p>
            </div>
            <Switch checked={sound} onChange={setSound} label="通知音" />
          </div>
          <div className="setting-row">
            <div className="row-text">
              <h4>アイコンのしるし</h4>
              <p>未達成のあいだ、ホーム画面のアイコンにしるしを表示{badgeSupported ? "" : "（この端末では使えません）"}</p>
            </div>
            <Switch checked={badge} onChange={setBadge} label="アイコンのしるし" />
          </div>
          <button type="button" className="btn outline wide" onClick={() => void testNotify()}>
            ためしに通知する
          </button>
          {(notifyMsg || ((notify || reminder) && perm === "default")) && <p className="hint">{notifyMsg ?? "オンにすると、ブラウザの通知許可を求めます。"}</p>}
          <div className="setting-row">
            <div className="row-text">
              <h4>アプリを閉じていても通知</h4>
              <p>
                {!pushConfigured
                  ? "クラウド通知は未設定です（管理者向け: README の Web Push の手順）"
                  : !auth.session
                    ? "ログインすると使えます（下の「バックアップと同期」）"
                    : "この端末で、アプリを閉じていても目標達成とリマインダーが届きます"}
              </p>
            </div>
            <Switch checked={pushOn} onChange={(v) => void togglePush(v)} label="アプリを閉じていても通知" disabled={!pushConfigured || !auth.session} />
          </div>
          {pushMsg && <p className="hint">{pushMsg}</p>}
        </section>

        <section className="card row-card" aria-label="ごほうびスタンプ">
          <span className="bubble pink" aria-hidden="true">⭐</span>
          <div className="row-text">
            <h3>ごほうびスタンプ</h3>
            <p>目標達成でカレンダーにかわいいスタンプ</p>
          </div>
          <Switch checked={stamp} onChange={setStamp} label="ごほうびスタンプ" />
          <ul className={`stamp-collection${stamp ? "" : " off"}`} aria-label="スタンプのしゅるい">
            {STAMP_KINDS.map((k) => (
              <li key={k}>
                <RewardStamp dayKey="2026-01-01" kind={k} size={40} straight />
                <span>{STAMP_NAMES[k]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="child-title">
          <div className="card-head">
            <span className="bubble yellow" aria-hidden="true">🧒</span>
            <h3 id="child-title">お子さま</h3>
          </div>
          {children.length > 1 && (
            <div className="child-chips" role="radiogroup" aria-label="表示する子ども">
              {children.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === identity.childId} className={c.id === identity.childId ? "on" : ""} onClick={() => void switchChild(c.id)}>
                  <span aria-hidden="true">{c.icon}</span> {c.name || "なまえ未設定"}
                </button>
              ))}
            </div>
          )}
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
          {adding ? (
            <form
              className="add-child"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void addChild(newName, newIcon).then(() => {
                  setAdding(false);
                  setNewName("");
                  setSaved(`${newName.trim()}を追加しました`);
                  setTimeout(() => setSaved(null), 2500);
                });
              }}
            >
              <label className="field">
                <span>追加する子の名前</span>
                <input type="text" value={newName} maxLength={12} required placeholder="例: そうたくん" onChange={(e) => setNewName(e.target.value)} autoFocus />
              </label>
              <div className="icon-pick" role="radiogroup" aria-label="追加する子のアイコン">
                {ICONS.map((ic) => (
                  <button key={ic} type="button" role="radio" aria-checked={newIcon === ic} className={newIcon === ic ? "on" : ""} onClick={() => setNewIcon(ic)} aria-label={`追加する子のアイコン ${ic}`}>
                    {ic}
                  </button>
                ))}
              </div>
              <div className="btn-row">
                <button type="button" className="btn outline" onClick={() => setAdding(false)}>
                  やめる
                </button>
                <button type="submit" className="btn mint">
                  追加する
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn outline wide add-child-btn" onClick={() => setAdding(true)}>
              ＋ 子どもを追加する
            </button>
          )}
          <p className="hint small">記録・目標・スタンプは子どもごとに別々に保存されます。</p>
        </section>

        <button type="button" className="btn-main mint save" onClick={() => void save()}>
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
          <p className="hint">記録をPDF（月ごとのレポート）やCSVで保存できます。歯科医院への共有・機種変更・バックアップに使えます。復元では、すでにある記録と重なるものは追加しません。</p>
          <button type="button" className="btn outline wide" onClick={exportCsv} disabled={!sessions.length || !!import.meta.env.VITE_PREVIEW}>
            CSVを書き出す
          </button>
          {import.meta.env.VITE_PREVIEW && <p className="hint small">プレビュー版ではファイルを保存できません（アプリ本体では使えます）。</p>}
          <Link className="btn outline wide link-btn" to="/report">
            PDFで保存（月ごとのレポート）
          </Link>
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
