import { Navigate, useLocation } from 'react-router-dom';
import { useResearcherAuth } from '@/hooks/useResearcherAuth';

export function RequireResearcher({ children }: { children: React.ReactNode }) {
  const { isAuthed, loading } = useResearcherAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to="/research/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
