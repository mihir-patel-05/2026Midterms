import { API_BASE_URL } from './api';
import type {
  ResearcherUser,
  ResearchRaceListItem,
  RaceDetailResponse,
  SimulationRequest,
  SimulationResponse,
} from '../types/research';

const TOKEN_KEY = 'researcher_token';

export function getResearcherToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setResearcherToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function researchFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getResearcherToken();
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    setResearcherToken(null);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json() as Promise<T>;
}

export async function loginResearcher(email: string, password: string): Promise<{ token: string; user: ResearcherUser }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/researcher/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function fetchMe(): Promise<ResearcherUser> {
  const data = await researchFetch<{ user: ResearcherUser }>('/auth/researcher/me');
  return data.user;
}

export async function fetchRaces(params: { state?: string; cycle?: number; officeType?: string }): Promise<ResearchRaceListItem[]> {
  const qs = new URLSearchParams();
  if (params.state) qs.set('state', params.state);
  if (params.cycle) qs.set('cycle', String(params.cycle));
  if (params.officeType) qs.set('officeType', params.officeType);
  const data = await researchFetch<{ races: ResearchRaceListItem[] }>(`/research/races?${qs.toString()}`);
  return data.races;
}

export async function fetchRaceDetail(state: string, officeType: string, district: string, cycle: number): Promise<RaceDetailResponse> {
  return researchFetch<RaceDetailResponse>(
    `/research/races/${state}/${officeType}/${encodeURIComponent(district)}/${cycle}`,
  );
}

export async function runSimulation(req: SimulationRequest): Promise<SimulationResponse> {
  return researchFetch<SimulationResponse>('/research/simulate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
