import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useResearcherAuth } from '@/hooks/useResearcherAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Layout } from '@/components/layout/Layout';
import { FlaskConical } from 'lucide-react';

export default function ResearcherLogin() {
  const { login, isAuthed, loading } = useResearcherAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  if (loading) return null;
  if (isAuthed) return <Navigate to="/research" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/research', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="container flex min-h-[70vh] items-center justify-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <CardTitle>Researcher Access</CardTitle>
            <CardDescription>
              Log in to drill into county-level race data and run vote-swing simulations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Researcher accounts are seeded manually. Contact an admin to request access.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
