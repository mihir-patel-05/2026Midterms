/**
 * Custom React hook for fetching candidates
 * Handles loading states, errors, and provides typed data
 */

import { useState, useEffect } from 'react';
import { getCandidates } from '@/lib/api';
import type { Candidate, GetCandidatesParams } from '@/types/candidate';

/**
 * Return type for useCandidates hook
 */
interface UseCandidatesReturn {
  candidates: Candidate[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Custom hook to fetch candidates from the API
 *
 * @param params - Optional query parameters for filtering candidates
 * @returns Object containing candidates array, loading state, error state, and refetch function
 *
 * @example
 * // Basic usage
 * const { candidates, loading, error } = useCandidates();
 *
 * @example
 * // With filters
 * const { candidates, loading, error, refetch } = useCandidates({
 *   state: 'CA',
 *   office: 'SENATE',
 *   cycle: 2026,
 *   includeFunds: true
 * });
 */
export default function useCandidates(
  params?: GetCandidatesParams
): UseCandidatesReturn {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[useCandidates] Fetching candidates with params:', params);

      const response = await getCandidates(params);
      setCandidates(response.data);

      console.log('[useCandidates] Successfully fetched', response.data.length, 'candidates');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch candidates';
      setError(errorMessage);
      console.error('[useCandidates] Error fetching candidates:', errorMessage);

      // Set empty array on error
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Track if component is mounted to prevent state updates after unmount
    let isMounted = true;

    const loadCandidates = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[useCandidates] Fetching candidates with params:', params);

        const response = await getCandidates(params);

        // Only update state if component is still mounted
        if (isMounted) {
          setCandidates(response.data);
          console.log('[useCandidates] Successfully fetched', response.data.length, 'candidates');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch candidates';

        if (isMounted) {
          setError(errorMessage);
          setCandidates([]);
          console.error('[useCandidates] Error fetching candidates:', errorMessage);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadCandidates();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
      console.log('[useCandidates] Cleanup: Component unmounted');
    };
  }, [
    params?.state,
    params?.office,
    params?.party,
    params?.cycle,
    params?.page,
    params?.perPage,
    params?.includeFunds,
  ]); // Re-fetch when params change

  return {
    candidates,
    loading,
    error,
    refetch: fetchCandidates,
  };
}
