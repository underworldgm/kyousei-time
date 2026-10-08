import { useEffect } from "react";
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PreviewBanner } from "../components/PreviewBanner";
import { AppDataProvider, useAppData } from "./AppData";
import { NavBar } from "../components/NavBar";
import { CalendarPage } from "../pages/CalendarPage";
import { StatsPage } from "../pages/StatsPage";
import { ReportPage } from "../pages/ReportPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TimerPage } from "../pages/TimerPage";
import { useAppBadge, useGoalNotifier, useReminder } from "../hooks/useGoalNotifier";
import { AuthProvider } from "../hooks/useAuth";
import { usePushSchedules } from "../hooks/usePushSchedules";

/** タブを切り替えたら先頭から表示する (上部の歯のキャラクターを隠さない) */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const data = useAppData();
  // 印刷用レポートはナビなしで表示
  const isReport = useLocation().pathname === "/report";
  useGoalNotifier(data);
  useReminder(data);
  useAppBadge(data);
  usePushSchedules(data);
  if (data.error) {
    return (
      <div className="fatal" role="alert">
        <h1>保存領域にアクセスできません</h1>
        <p>このブラウザでは記録を保存できない状態です（プライベートモードや保存容量の不足など）。通常のブラウザで開き直してください。</p>
        <button className="btn mint" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }
  if (!data.loaded) return <div className="loading" aria-busy="true">よみこみ中…</div>;
  return (
    <>
      <ScrollToTop />
      {import.meta.env.VITE_PREVIEW && !isReport && <PreviewBanner />}
      <div className={isReport ? "screen report-screen" : "screen"}>
        <Routes>
          <Route path="/" element={<TimerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!isReport && <NavBar />}
    </>
  );
}

// プレビュー版は埋め込み表示で URL を書き換えられないため、画面遷移をメモリ上で管理する
const Router = import.meta.env.VITE_PREVIEW ? MemoryRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <div className="app">
        <AuthProvider>
          <AppDataProvider>
            <Shell />
          </AppDataProvider>
        </AuthProvider>
      </div>
    </Router>
  );
}
