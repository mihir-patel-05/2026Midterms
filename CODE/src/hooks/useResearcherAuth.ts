import { useCallback, useEffect, useState } from 'react';
import {
  fetchMe,
  getResearcherToken,
  loginResearcher,
  setResearcherToken,
} from '@/lib/researcherAuth';
import type { ResearcherUser } from '@/types/research';

export function useResearcherAuth() {
  const [user, setUser] = useState<ResearcherUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getResearcherToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => {
        setResearcherToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { token, user: u } = await loginResearcher(email, password);
      setResearcherToken(token);
      setUser(u);
      return u;
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    setResearcherToken(null);
    setUser(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthed: !!user,
    login,
    logout,
  };
}
