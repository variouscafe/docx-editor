import { useEffect, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "./store/auth";
import { useThemeStore, applyTheme } from "./store/theme";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/Layout/AppShell";
import { Login } from "./pages/Login";
import ReportList from "./pages/ReportList";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import { Settings } from "./pages/Settings";
import { CommandPalette } from "./components/Layout/CommandPalette";
import { Toaster } from "./components/ui/sonner";
import { lazyChunk } from "./utils/lazyChunk";

// 에디터(TipTap/docx 등)는 초기 번들에서 분리 — 목록/로그인 로드 가벼움.
const ReportEditor = lazyChunk(() => import("./pages/ReportEditor"));
// 퍼블릭 공유 뷰도 TipTap 번들을 사용 → lazy 로 분리.
const PublicReportView = lazyChunk(() => import("./pages/PublicReportView"));

function EditorFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
      {t("common.loading")}
    </div>
  );
}

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <>
    <ErrorBoundary area="app">
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 퍼블릭 링크 공유 — 로그인 없이 읽기 전용. ProtectedRoute 밖. */}
      <Route
        path="/share/:token"
        element={
          <ErrorBoundary area="public">
            <Suspense fallback={<EditorFallback />}>
              <PublicReportView />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route element={<ProtectedRoute isAuthed={!!accessToken} />}>
        <Route index element={<Navigate to="/reports" replace />} />
        <Route
          path="/reports"
          element={
            <AppShell>
              <ReportList />
            </AppShell>
          }
        />
        <Route
          path="/groups"
          element={
            <AppShell>
              <Groups />
            </AppShell>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <AppShell>
              <GroupDetail />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell>
              <Settings />
            </AppShell>
          }
        />
        <Route
          path="/reports/new"
          element={
            <ErrorBoundary area="editor">
              <Suspense fallback={<EditorFallback />}>
                <ReportEditor />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="/reports/:id"
          element={
            <ErrorBoundary area="editor">
              <Suspense fallback={<EditorFallback />}>
                <ReportEditor />
              </Suspense>
            </ErrorBoundary>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/reports" replace />} />
    </Routes>
    </ErrorBoundary>
    <CommandPalette />
    <Toaster />
    </>
  );
}
