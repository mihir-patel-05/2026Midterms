import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useResearcherAuth } from '@/hooks/useResearcherAuth';
import { BarChart3, MapPinned, Sliders, LogOut } from 'lucide-react';

export default function ResearchDashboard() {
  const { user, logout } = useResearcherAuth();

  return (
    <Layout>
      <div className="container py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">Researcher Portal</p>
            <h1 className="font-heading text-3xl font-bold">
              Welcome{user?.name ? `, ${user.name}` : ''}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore every district race down to the county level and run what-if simulations on historical results.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Link to="/research/races">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPinned className="h-5 w-5" />
                </div>
                <CardTitle>Race Tracker</CardTitle>
                <CardDescription>
                  Browse district races and drill into per-county returns.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Open tracker →</span>
              </CardContent>
            </Card>
          </Link>

          <Link to="/research/simulate">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sliders className="h-5 w-5" />
                </div>
                <CardTitle>Swing Simulator</CardTitle>
                <CardDescription>
                  Apply D/R percentage swings to any baseline cycle and see flipped seats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Open simulator →</span>
              </CardContent>
            </Card>
          </Link>

          <Card className="h-full">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <BarChart3 className="h-5 w-5" />
              </div>
              <CardTitle>Saved scenarios</CardTitle>
              <CardDescription>
                Persistence is scaffolded — a UI to save and compare runs is a follow-up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">Coming soon</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
