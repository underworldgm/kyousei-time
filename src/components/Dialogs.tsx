import { useEffect, useRef, useState, type ReactNode } from "react";
import { addSession, updateSession } from "../db/repo";
import { validateRange } from "../lib/validation";
import { dayKeyOf, fmtDuration, fromJst, jstHM, MIN_MS } from "../lib/time";
import type { WearSession } from "../types";

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = () => onClose();
    d.addEventListener("close", h);
    return () => d.removeEventListener("close", h);
  }, [onClose]);
  return ref;
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel = "削除する", cancelLabel = "やめる", danger = true, onConfirm, onClose }: ConfirmProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      {body && <div className="dialog-body">{body}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn outline" onClick={onClose} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${danger ? "coral" : "mint"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

interface EditorProps {
  open: boolean;
  /** 編集対象。null なら新規追加 */
  session: WearSession | null;
  /** 新規追加時の既定日 (JST) */
  defaultDay: string;
  now: number;
  /** 重なり検証用の既存の記録 */
  sessions: WearSession[];
  onClose: () => void;
  onRequestDelete?: (s: WearSession) => void;
}

/** 記録の追加・修正 (開始/終了を日付+時刻で指定。端末のタイムゾーンに関係なく JST で解釈する) */
export function SessionEditor({ open, session, defaultDay, now, sessions, onClose, onRequestDelete }: EditorProps) {
  const ref = useDialog(open, onClose);
  const [sDay, setSDay] = useState(defaultDay);
  const [sTime, setSTime] = useState("08:00");
  const [eDay, setEDay] = useState(defaultDay);
  const [eTime, setETime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isActive = !!session && !session.endTime;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setWarning(null);
    setSaving(false);
    if (session) {
      const s = Date.parse(session.startTime);
      setSDay(dayKeyOf(s));
      setSTime(jstHM(s));
      const e = session.endTime ? Date.parse(session.endTime) : now;
      setEDay(dayKeyOf(e));
      setETime(jstHM(e));
    } else {
      const isToday = defaultDay === dayKeyOf(now);
      setSDay(defaultDay);
      setEDay(defaultDay);
      if (isToday) {
        const end = Math.floor(now / MIN_MS) * MIN_MS;
        setETime(jstHM(end));
        setSTime(jstHM(end - 60 * MIN_MS < Date.parse(`${defaultDay}T00:00:00+09:00`) ? Date.parse(`${defaultDay}T00:00:00+09:00`) : end - 60 * MIN_MS));
      } else {
        setSTime("08:00");
        setETime("09:00");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id]);

  const startMs = fromJst(sDay, sTime);
  const endMs = fromJst(eDay, eTime);
  const preview = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? fmtDuration(Math.floor((endMs - startMs) / MIN_MS)) : "—";

  const submit = async (confirmed: boolean) => {
    if (saving) return;
    setError(null);
    const check = validateRange(startMs, isActive ? null : endMs, Date.now(), sessions, session?.id);
    if (!check.ok) {
      setError(check.error);
      setWarning(null);
      return;
    }
    if (check.warning && !confirmed) {
      setWarning(check.warning); // 確認してから保存 (「このまま保存」)
      return;
    }
    setSaving(true);
    const res = session
      ? await updateSession(session.id, startMs, isActive ? null : endMs)
      : await addSession(startMs, endMs);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      setWarning(null);
      return;
    }
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog editor" aria-labelledby="editor-title">
      <h2 id="editor-title">{session ? "記録を編集" : "記録を追加"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(!!warning);
        }}
      >
        <fieldset>
          <legend>開始時間</legend>
          <div className="field-row">
            <input type="date" value={sDay} onChange={(e) => setSDay(e.target.value)} required aria-label="開始日" />
            <input type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} required aria-label="開始時刻" />
          </div>
        </fieldset>
        <fieldset disabled={isActive}>
          <legend>終了時間</legend>
          <div className="field-row">
            <input type="date" value={eDay} onChange={(e) => setEDay(e.target.value)} required aria-label="終了日" />
            <input type="time" value={eTime} onChange={(e) => setETime(e.target.value)} required aria-label="終了時刻" />
          </div>
          {isActive && <p className="hint">装着中のため、終了時間は「装着終了」を押すと自動で記録されます。</p>}
        </fieldset>
        <p className="editor-total">
          装着時間 <strong>{isActive ? "装着中" : preview}</strong>
        </p>
        {error && (
          <p className="form-error" role="alert">
            ⚠ {error}
          </p>
        )}
        {warning && (
          <p className="form-warn" role="alert">
            ⚠ {warning}
          </p>
        )}
        <div className="dialog-actions">
          {session && onRequestDelete ? (
            <button type="button" className="btn outline-coral" onClick={() => onRequestDelete(session)}>
              削除
            </button>
          ) : (
            <button type="button" className="btn outline" onClick={onClose}>
              キャンセル
            </button>
          )}
          <button type="submit" className="btn mint" disabled={saving}>
            {warning ? "このまま保存" : session ? "保存" : "追加する"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
