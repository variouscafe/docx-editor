import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useThemeStore, applyTheme } from "./store/theme";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/Layout/AppShell";
import { Login } from "./pages/Login";
import ReportList from "./pages/ReportList";
import { CommandPalette } from "./components/Layout/CommandPalette";
import { Toaster } from "./components/ui/sonner";

// 에디터(TipTap/docx 등)는 초기 번들에서 분리 — 목록/로그인 로드 가벼움.
const ReportEditor = lazy(() => import("./pages/ReportEditor"));

const editorFallback = (
  <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
    불러오는 중…
  </div>
);

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <>
    <Routes>
      <Route path="/login" element={<Login />} />
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
          path="/reports/new"
          element={
            <Suspense fallback={editorFallback}>
              <ReportEditor />
            </Suspense>
          }
        />
        <Route
          path="/reports/:id"
          element={
            <Suspense fallback={editorFallback}>
              <ReportEditor />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/reports" replace />} />
    </Routes>
    <CommandPalette />
    <Toaster />
    </>
  );
}
