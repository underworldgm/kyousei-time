import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppDataProvider, useAppData } from "./AppData";
import { NavBar } from "../components/NavBar";
import { CalendarPage } from "../pages/CalendarPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TimerPage } from "../pages/TimerPage";
import { useGoalNotifier } from "../hooks/useGoalNotifier";

function Shell() {
  const data = useAppData();
  useGoalNotifier(data);
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
      <div className="screen">
        <Routes>
          <Route path="/" element={<TimerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <NavBar />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <AppDataProvider>
          <Shell />
        </AppDataProvider>
      </div>
    </BrowserRouter>
  );
}
