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
  DetailedFinanceResponse,
  Election,
  ElectionsResponse,
  GetElectionsParams,
  StateElectionCountsResponse,
  StateElectionsResponse,
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
 * Get detailed financial data for a candidate
 * Includes funding sources breakdown, top donors, and spending categories
 * Automatically fetches from FEC API if data is missing
 *
 * @param id - Candidate UUID
 * @param cycle - Optional election cycle (default: 2026)
 * @returns Promise<DetailedFinanceResponse> - Detailed finance breakdown
 * @throws Error if candidate not found (404)
 *
 * @example
 * const finances = await getCandidateDetailedFinances('1502a1c0-f0e9-4aeb-b8aa-1b34fc5a7f3e');
 */
export async function getCandidateDetailedFinances(
  id: string,
  cycle: number = 2026
): Promise<DetailedFinanceResponse> {
  if (!id || id.trim() === '') {
    throw new Error('Candidate ID is required');
  }

  const endpoint = `/candidates/${id}/finances/detailed?cycle=${cycle}`;
  return fetchAPI<DetailedFinanceResponse>(endpoint);
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

// ============================================================================
// ELECTIONS API
// ============================================================================

/**
 * Get all elections with optional filters
 * @param params - Filter and pagination parameters
 * @returns Paginated elections response
 * @example
 * ```ts
 * const { data, pagination } = await getElections({ state: 'CA', cycle: 2026 });
 * ```
 */
export async function getElections(
  params?: GetElectionsParams
): Promise<ElectionsResponse> {
  const queryParams = new URLSearchParams();

  if (params?.state) queryParams.append('state', params.state);
  if (params?.district) queryParams.append('district', params.district);
  if (params?.officeType) queryParams.append('officeType', params.officeType);
  if (params?.electionType) queryParams.append('electionType', params.electionType);
  if (params?.cycle) queryParams.append('cycle', params.cycle.toString());
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.perPage) queryParams.append('perPage', params.perPage.toString());

  const url = `/elections${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return fetchAPI(url);
}

/**
 * Get elections for a specific state
 * @param state - Two-letter state code (e.g., 'CA', 'TX')
 * @param cycle - Election cycle year (default: 2026)
 * @returns State elections response with list of elections
 * @example
 * ```ts
 * const { state, elections, count } = await getElectionsByState('CA', 2026);
 * ```
 */
export async function getElectionsByState(
  state: string,
  cycle?: number
): Promise<StateElectionsResponse> {
  const queryParams = new URLSearchParams();
  if (cycle) queryParams.append('cycle', cycle.toString());

  const url = `/elections/states/${state.toUpperCase()}${
    queryParams.toString() ? `?${queryParams.toString()}` : ''
  }`;
  return fetchAPI(url);
}

/**
 * Get race counts by state for map visualization
 * @param cycle - Election cycle year (default: 2026)
 * @returns Array of state codes with race counts
 * @example
 * ```ts
 * const { cycle, states } = await getStateElectionCounts(2026);
 * // states = [{ state: 'CA', races: 54 }, { state: 'TX', races: 38 }, ...]
 * ```
 */
export async function getStateElectionCounts(
  cycle?: number
): Promise<StateElectionCountsResponse> {
  const queryParams = new URLSearchParams();
  if (cycle) queryParams.append('cycle', cycle.toString());

  const url = `/elections/states/counts${
    queryParams.toString() ? `?${queryParams.toString()}` : ''
  }`;
  return fetchAPI(url);
}

/**
 * Get a single election by ID
 * @param id - Election ID
 * @returns Election details with candidates
 * @example
 * ```ts
 * const election = await getElectionById('abc123');
 * ```
 */
export async function getElectionById(id: string): Promise<Election> {
  return fetchAPI(`/elections/${id}`);
}

// ============================================================================
// DEADLINES API
// ============================================================================

/**
 * Deadline type for upcoming registration and election deadlines
 */
export interface Deadline {
  id: string;
  title: string;
  date: string;
  type: 'registration' | 'election' | 'other';
  states: string[];
  description: string | null;
  urgent: boolean;
}

export interface DeadlinesResponse {
  deadlines: Deadline[];
}

/**
 * Get upcoming deadlines for voter registration and elections
 * @returns List of active upcoming deadlines sorted by date
 * @example
 * ```ts
 * const { deadlines } = await getDeadlines();
 * ```
 */
export async function getDeadlines(): Promise<DeadlinesResponse> {
  return fetchAPI<DeadlinesResponse>('/deadlines');
}

// ============================================================================
// CHAT API
// ============================================================================

/**
 * Chat message interface for AI chat feature
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Request body for sending chat messages
 */
export interface SendChatMessageRequest {
  message: string;
  sessionId: string;
}

/**
 * Response from chat API
 */
export interface ChatResponse {
  message: string;
  timestamp: string;
  sessionId: string;
}

/**
 * Send a chat message and get AI response
 * @param request - Message and session ID
 * @returns Promise<ChatResponse> - AI response with timestamp
 * @example
 * ```ts
 * const response = await sendChatMessage({
 *   message: "What are the Senate races in California?",
 *   sessionId: "session-123"
 * });
 * ```
 */
export async function sendChatMessage(
  request: SendChatMessageRequest
): Promise<ChatResponse> {
  return fetchAPI<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Clear chat conversation history
 * @param sessionId - Session ID to clear
 * @returns Promise<{message: string, sessionId: string}>
 * @example
 * ```ts
 * await clearChatHistory("session-123");
 * ```
 */
export async function clearChatHistory(sessionId: string): Promise<{
  message: string;
  sessionId: string;
}> {
  return fetchAPI(`/chat/${sessionId}`, {
    method: 'DELETE',
  });
}

// Export API base URL for reference
export { API_BASE_URL };
