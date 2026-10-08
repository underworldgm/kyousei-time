import { NavLink } from "react-router-dom";

const icons = {
  settings: (
    <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.2 4.4c0-.3.1-.6.1-1s0-.7-.1-1l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.200 7.200 0 0 0-1.700-1l-.4-2.500a.5.5 0 0 0-.5-.4H10.200a.5.5 0 0 0-.5.4l-.4 2.500c-.6.2-1.200.6-1.700 1l-2.400-1a.5.5 0 0 0-.6.2L2.700 9.800a.5.500 0 0 0 .1.600l2 1.600c0 .3-.1.600-.1 1s0 .7.100 1l-2 1.600a.5.5 0 0 0-.1.600l1.900 3.300c.1.200.4.300.6.200l2.400-1c.5.4 1.100.8 1.700 1l.4 2.500c0 .2.200.4.500.4h3.800c.3 0 .5-.2.5-.4l.4-2.500c.6-.2 1.200-.6 1.700-1l2.400 1c.2.100.5 0 .6-.2l1.900-3.300a.5.5 0 0 0-.1-.6l-2-1.600Z" />
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 8.500V13l3 2M9.500 2.500h5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.500" y="5" width="17" height="15.500" rx="3.500" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M8 2.800v4M16 2.800v4M3.500 10.500h17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="9" cy="15" r="1.300" /><circle cx="15" cy="15" r="1.300" />
    </>
  ),
};

const chartIcon = (
  <>
    <rect x="4" y="12" width="4" height="8" rx="1.5" />
    <rect x="10" y="7" width="4" height="13" rx="1.5" />
    <rect x="16" y="3.5" width="4" height="16.5" rx="1.5" />
  </>
);

const items = [
  { to: "/settings", label: "設定", icon: icons.settings },
  { to: "/", label: "時間", icon: icons.timer },
  { to: "/calendar", label: "カレンダー", icon: icons.calendar },
  { to: "/stats", label: "グラフ", icon: chartIcon },
] as const;

export function NavBar() {
  return (
    <nav className="nav" aria-label="メインメニュー">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} aria-label={it.label}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            {it.icon}
          </svg>
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
