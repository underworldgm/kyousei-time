import { fmtDuration, jstHM, DAY_MS, dayStartMs, MIN_MS, type DayEntry } from "../lib/time";

interface Props {
  entry: DayEntry;
  dayKey: string;
  onEdit: (e: DayEntry) => void;
  onDelete: (e: DayEntry) => void;
}

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19l-4 1Z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

/** 1回の装着 = 1行。装着中は「装着中」と分かる表示にする。 */
export function SessionRow({ entry, dayKey, onEdit, onDelete }: Props) {
  const startLabel = entry.fromPrevDay ? `前日 ${jstHM(Date.parse(entry.session.startTime))}` : jstHM(entry.start);
  const dayEnd = dayStartMs(dayKey) + DAY_MS;
  const endLabel = entry.active ? "装着中" : entry.toNextDay ? `翌${jstHM(Date.parse(entry.session.endTime!))}` : entry.end === dayEnd ? "24:00" : jstHM(entry.end);
  const duration = fmtDuration(Math.floor(entry.ms / MIN_MS));
  const crossNote = entry.fromPrevDay || entry.toNextDay ? "日付をまたぐ記録" : null;
  return (
    <li className={`session-row${entry.active ? " active" : ""}`}>
      <span className="session-icon" aria-hidden="true">
        {entry.active ? "●" : "✓"}
      </span>
      <div className="session-main">
        <p className="session-time">
          <span>{startLabel}</span> → <span>{entry.active ? <strong className="live">装着中</strong> : endLabel}</span>
        </p>
        <p className="session-dur">
          {duration}
          {crossNote && <small>（{crossNote}）</small>}
        </p>
      </div>
      <button type="button" className="icon-btn" aria-label={`${startLabel}の記録を編集`} onClick={() => onEdit(entry)}>
        <PencilIcon />
      </button>
      <button type="button" className="icon-btn danger" aria-label={`${startLabel}の記録を削除`} onClick={() => onDelete(entry)}>
        <TrashIcon />
      </button>
    </li>
  );
}
