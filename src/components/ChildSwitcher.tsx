import { useAppData } from "../app/AppData";
import { switchChild } from "../db/repo";

/** 子どもが2人以上いるときだけ、ヘッダーで切り替えられるようにする */
export function ChildSwitcher() {
  const { children, identity } = useAppData();
  if (children.length < 2) return null;
  return (
    <label className="child-switch">
      <span className="child-switch-label" aria-hidden="true">
        きりかえ ▾
      </span>
      <select aria-label="表示する子どもを切り替える" value={identity.childId} onChange={(e) => void switchChild(e.target.value)}>
        {children.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name || "なまえ未設定"}
          </option>
        ))}
      </select>
    </label>
  );
}
