/**
 * API Client for 2026 Midterms Backend
 * Handles all API requests with error handling and TypeScript types
 */

import type {
  Candidate,
  CandidatesResponse,
  GetCandidatesParams,
  ApiError,
  CandidateFinanceResponse,
} from '../types/candidate';

// API Base URL - defaults to localhost:3001 if not set in environment
// Handles both Vite (import.meta.env) and Node.js (process.env) environments
const getApiUrl = (): string => {
  // Check if running in Vite environment (browser)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_API_URL || 'http://localhost:3001';
  }
  // Fallback to Node.js environment (for testing)
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_API_URL || 'http://localhost:3001';
  }
  // Default fallback
  return 'http://localhost:3001';
};

const API_BASE_URL = getApiUrl();
const API_PREFIX = '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${API_PREFIX}${endpoint}`;

  try {
    console.log(`[API] Fetching: ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));

      console.error(`[API Error] ${url}:`, errorData);
      throw new Error(errorData.error || errorData.message || 'API request failed');
    }

    const data = await response.json();
    console.log(`[API Success] ${url}:`, data);

    return data as T;
  } catch (error) {
    // Network errors or other fetch failures
    if (error instanceof Error) {
      console.error(`[API Network Error] ${url}:`, error.message);
      throw error;
    }

    console.error(`[API Unknown Error] ${url}:`, error);
    throw new Error('An unexpected error occurred');
  }
}

/**
 * Build query string from parameters
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Get list of candidates with optional filters and pagination
 *
 * @param params - Optional query parameters
 * @returns Promise<CandidatesResponse> - Paginated list of candidates
 *
 * @example
 * // Get all candidates
 * const candidates = await getCandidates();
 *
 * @example
 * // Get California Senate candidates for 2026 with financial data
 * const candidates = await getCandidates({
 *   state: 'CA',
 *   office: 'SENATE',
 *   cycle: 2026,
 *   includeFunds: true
 * });
 */
export async function getCandidates(
  params?: GetCandidatesParams
): Promise<CandidatesResponse> {
  const queryString = params ? buildQueryString(params) : '';
  const endpoint = `/candidates${queryString}`;

  return fetchAPI<CandidatesResponse>(endpoint);
}

/**
 * Get a single candidate by ID
 *
 * @param id - Candidate UUID
 * @returns Promise<Candidate> - Full candidate details
 * @throws Error if candidate not found (404)
 *
 * @example
 * const candidate = await getCandidateById('1502a1c0-f0e9-4aeb-b8aa-1b34fc5a7f3e');
 */
export async function getCandidateById(id: string): Promise<Candidate> {
  if (!id || id.trim() === '') {
    throw new Error('Candidate ID is required');
  }

  const endpoint = `/candidates/${id}`;
  return fetchAPI<Candidate>(endpoint);
}

/**
 * Get candidate by FEC candidate ID (e.g., "H6CA52179")
 *
 * @param candidateId - FEC candidate ID
 * @returns Promise<Candidate> - Full candidate details
 * @throws Error if candidate not found (404)
 *
 * @example
 * const candidate = await getCandidateByFecId('H6CA52179');
 */
export async function getCandidateByFecId(candidateId: string): Promise<Candidate> {
  if (!candidateId || candidateId.trim() === '') {
    throw new Error('FEC Candidate ID is required');
  }

  const endpoint = `/candidates/fec/${candidateId}`;
  return fetchAPI<Candidate>(endpoint);
}

/**
 * Get financial data for a candidate
 *
 * @param id - Candidate UUID
 * @param cycle - Optional election cycle (e.g., 2026)
 * @returns Promise<CandidateFinanceResponse> - Finance data for candidate's committees
 * @throws Error if candidate not found (404)
 *
 * @example
 * const finances = await getCandidateFinances('1502a1c0-f0e9-4aeb-b8aa-1b34fc5a7f3e');
 */
export async function getCandidateFinances(
  id: string,
  cycle?: number
): Promise<CandidateFinanceResponse> {
  if (!id || id.trim() === '') {
    throw new Error('Candidate ID is required');
  }

  const queryString = cycle ? `?cycle=${cycle}` : '';
  const endpoint = `/candidates/${id}/finances${queryString}`;
  return fetchAPI<CandidateFinanceResponse>(endpoint);
}

/**
 * Health check endpoint
 *
 * @returns Promise with API health status
 */
export async function checkApiHealth(): Promise<{
  status: string;
  timestamp: string;
  service: string;
}> {
  return fetchAPI('/health');
}

// Export API base URL for reference
export { API_BASE_URL };
