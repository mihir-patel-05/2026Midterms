const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AdminStats {
  candidates: number;
  elections: number;
  committees: number;
  statesWithCandidates: number;
  lastSync: {
    type: string;
    completedAt: string;
    recordsProcessed: number;
    duration: number;
  } | null;
}

interface SyncLog {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  recordsErrors: number;
  duration: number | null;
  errorMessage: string | null;
}

interface SyncStatus {
  isRunning: boolean;
  currentSync: {
    id: string;
    type: string;
    status: string;
    startedAt: string;
    recordsProcessed: number;
  } | null;
  recentLogs: SyncLog[];
}

interface SyncResult {
  message: string;
  syncId: string;
  status: string;
}

interface GenerateResult {
  message: string;
  cycle: number;
  electionsCreated: number;
  candidateLinksCreated: number;
  errors: number;
}

interface Deadline {
  id: string;
  title: string;
  date: string;
  type: 'registration' | 'election' | 'other';
  states: string[];
  description: string | null;
  urgent: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeadlinesResponse {
  deadlines: Deadline[];
}

interface DeadlineInput {
  title: string;
  date: string;
  type: 'registration' | 'election' | 'other';
  states: string[];
  description?: string;
  urgent?: boolean;
  isActive?: boolean;
}

interface DeadlineResult {
  message: string;
  deadline: Deadline;
}

class AdminAPI {
  private adminKey: string | null = null;

  setAdminKey(key: string) {
    this.adminKey = key;
    sessionStorage.setItem('adminKey', key);
  }

  getAdminKey(): string | null {
    if (!this.adminKey) {
      this.adminKey = sessionStorage.getItem('adminKey');
    }
    return this.adminKey;
  }

  clearAdminKey() {
    this.adminKey = null;
    sessionStorage.removeItem('adminKey');
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const adminKey = this.getAdminKey();
    if (adminKey) {
      headers['x-admin-key'] = adminKey;
    }

    const response = await fetch(`${API_URL}/api/admin${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }

  async verifyPassword(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetch<{ success: boolean; token: string }>('/verify', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      this.setAdminKey(response.token);
      return { success: true };
    } catch (error) {
      // Provide more specific error messages
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return { success: false, error: 'Cannot connect to server. Is the backend running?' };
      }
      if (error instanceof Error) {
        if (error.message.includes('CORS') || error.message.includes('NetworkError')) {
          return { success: false, error: 'Network error. Check if backend is running on correct port.' };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Invalid credentials' };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.fetch<{ message: string }>('/logout', { method: 'POST' });
    } catch {
      // Ignore errors — we're logging out anyway
    }
    this.clearAdminKey();
  }

  async getStats(): Promise<AdminStats> {
    return this.fetch<AdminStats>('/stats');
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.fetch<SyncStatus>('/sync-status');
  }

  async triggerSync(): Promise<SyncResult> {
    return this.fetch<SyncResult>('/sync', { method: 'POST' });
  }

  async generateElections(cycle: number = 2026): Promise<GenerateResult> {
    return this.fetch<GenerateResult>(`/generate-elections?cycle=${cycle}`, { method: 'POST' });
  }

  // Deadline management methods
  async getDeadlines(): Promise<DeadlinesResponse> {
    return this.fetch<DeadlinesResponse>('/deadlines');
  }

  async createDeadline(deadline: DeadlineInput): Promise<DeadlineResult> {
    return this.fetch<DeadlineResult>('/deadlines', {
      method: 'POST',
      body: JSON.stringify(deadline),
    });
  }

  async updateDeadline(id: string, deadline: Partial<DeadlineInput>): Promise<DeadlineResult> {
    return this.fetch<DeadlineResult>(`/deadlines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(deadline),
    });
  }

  async deleteDeadline(id: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/deadlines/${id}`, {
      method: 'DELETE',
    });
  }
}

export const adminAPI = new AdminAPI();
export type { AdminStats, SyncStatus, SyncLog, SyncResult, GenerateResult, Deadline, DeadlineInput, DeadlinesResponse };

