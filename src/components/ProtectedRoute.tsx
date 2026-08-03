import { Navigate, Outlet } from 'react-router-dom';

export function ProtectedRoute({ isAuthed }: { isAuthed: boolean }) {
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}
