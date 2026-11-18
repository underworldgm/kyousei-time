import { useState } from "react";
import { useAppData } from "../app/AppData";
import { saveChild, saveSettings } from "../db/repo";
import { ensurePermission } from "../lib/notifications";
import { fmtDuration, stepTargetMinutes } from "../lib/time";
import { CHILD_ICONS } from "../lib/childIcons";
import { useDialog } from "./Dialogs";
import { Mascot } from "./Mascot";

const KEY = "kyousei-onboarded";

function onboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // 保存できない環境では毎回出さない
  }
}
function markOnboarded() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* 保存できなくてもよい */
  }
}

/** はじめて開いたとき (名前も記録もないとき) だけ出す、かんたん設定 */
export function Welcome() {
  const { child, sessions, settings, loaded } = useAppData();
  const fresh = loaded && !!settings && !child?.name && sessions.length === 0 && !onboarded();
  const [open, setOpen] = useState(true);
  const close = () => {
    markOnboarded();
    setOpen(false);
  };
  const ref = useDialog(fresh && open, close);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🦷");
  const [minutes, setMinutes] = useState(840);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const step = (d: number) => setMinutes((m) => stepTargetMinutes(m, d));

  if (!fresh) return null;
  return (
    <dialog ref={ref} className="dialog welcome" aria-labelledby="welcome-title">
      <div className="welcome-head">
        <Mascot size={64} mood="cheer" />
        <div>
          <h2 id="welcome-title">ようこそ！</h2>
          <p>はじめに、かんたんな設定をしましょう。あとから設定画面で変えられます。</p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            if (name.trim()) await saveChild({ name: name.trim(), icon });
            await saveSettings({ dailyTargetMinutes: minutes, notificationsEnabled: notify });
            if (notify) await ensurePermission();
          } finally {
            setBusy(false);
            close();
          }
        }}
      >
        <label className="field">
          <span>お子さまの名前（ニックネーム）</span>
          <input type="text" value={name} maxLength={12} placeholder="例: みなちゃん" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="icon-pick" role="radiogroup" aria-label="アイコン">
          {CHILD_ICONS.map((ic) => (
            <button key={ic} type="button" role="radio" aria-checked={icon === ic} className={icon === ic ? "on" : ""} onClick={() => setIcon(ic)} aria-label={`アイコン ${ic}`}>
              {ic}
            </button>
          ))}
        </div>
        <fieldset className="welcome-goal">
          <legend>1日の装着目標</legend>
          <div className="stepper">
            <button type="button" className="step-btn" onClick={() => step(-1)} disabled={minutes <= 60} aria-label="目標時間を30分減らす">
              −
            </button>
            <output className="step-val small" aria-live="polite">
              {fmtDuration(minutes, { short: true })}
            </output>
            <button type="button" className="step-btn" onClick={() => step(1)} disabled={minutes >= 24 * 60} aria-label="目標時間を30分増やす">
              ＋
            </button>
          </div>
          <p className="hint small center">歯科医院から指示された時間を設定してください。</p>
        </fieldset>
        <label className="welcome-check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          目標の時間になったら通知する
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn outline" onClick={close}>
            あとで
          </button>
          <button type="submit" className="btn mint" disabled={busy}>
            はじめる
          </button>
        </div>
      </form>
    </dialog>
  );
}
