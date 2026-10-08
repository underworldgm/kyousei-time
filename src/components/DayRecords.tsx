import { useState } from "react";
import { deleteSession } from "../db/repo";
import { entriesOnDay, type DayEntry } from "../lib/time";
import type { WearSession } from "../types";
import { ConfirmDialog, SessionEditor } from "./Dialogs";
import { SessionRow } from "./SessionRow";

interface Props {
  sessions: WearSession[];
  dayKey: string;
  now: number;
  emptyText?: string;
  /** true の場合、下に「記録を追加する」ボタンを出す */
  allowAdd?: boolean;
}

/** その日の装着履歴 + 追加・編集・削除 (削除は確認ダイアログ付き) */
export function DayRecords({ sessions, dayKey, now, emptyText = "まだ記録がありません", allowAdd = true }: Props) {
  const entries = entriesOnDay(sessions, dayKey, now);
  const [editing, setEditing] = useState<WearSession | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<DayEntry["session"] | null>(null);

  const openEdit = (e: DayEntry) => {
    setEditing(e.session);
    setEditorOpen(true);
  };
  return (
    <>
      {entries.length ? (
        <ul className="session-list">
          {entries.map((e) => (
            <SessionRow key={`${e.session.id}-${e.start}`} entry={e} dayKey={dayKey} onEdit={openEdit} onDelete={(x) => setDeleting(x.session)} />
          ))}
        </ul>
      ) : (
        <p className="empty">{emptyText}</p>
      )}
      {allowAdd && (
        <button
          type="button"
          className="btn outline wide"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <span aria-hidden="true">＋</span> 記録を追加する
        </button>
      )}
      <SessionEditor
        open={editorOpen}
        session={editing}
        defaultDay={dayKey}
        now={now}
        sessions={sessions}
        onClose={() => setEditorOpen(false)}
        onRequestDelete={(s) => {
          setEditorOpen(false);
          setDeleting(s);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="この装着記録を削除しますか？"
        body={<p>削除すると、その日の合計や達成の判定も更新されます。</p>}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteSession(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
