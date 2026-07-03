/**
 * Typed client for a self-hosted Sourdough AI server.
 * All authenticated calls send `Authorization: Bearer <personal access token>`.
 */

export type ServerMeta = {
  name: string;
  version: string;
  minMobileVersion: string;
  features: { ai: boolean };
};

export type LoginResponse = {
  token: string;
  tokenId: string;
  user: { id: string; email: string; timezone: string };
};

export type Feeding = {
  id: string;
  fedAt: string;
  starterAmountG: number;
  flourAmountG: number;
  waterAmountG: number;
  flourNotes: string | null;
  notes: string | null;
};

export type Bake = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  doughBatchName: string | null;
  recipe?: { title: string } | null;
};

export type Dashboard = {
  insights?: string[];
  insightsGenerating?: boolean;
  userTimezone?: string;
  appTimezone?: string;
  devices?: { id: string; name: string; lastSeenAt: string | null }[];
  currentBake?: { id: string; startedAt: string; recipe?: { title?: string } | null } | null;
  lastStarterCycle?: { id: string; startedAt: string; endedAt: string | null } | null;
  starterPrediction?: { predictedPeakAt?: string | null } | null;
  starterPredictionStatus?: string | null;
  latestStarterReadings?: { recordedAt: string; distanceMm: number | null; ambientTempC: number | null; ambientHumidityPct?: number | null }[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Normalize user input like "myserver.local:3000" into an origin URL. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string | null = null,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  }

  private json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  getMeta(): Promise<ServerMeta> {
    return this.request<ServerMeta>("/api/meta");
  }

  login(email: string, password: string, deviceName: string): Promise<LoginResponse> {
    return this.request<LoginResponse>("/api/auth/mobile", this.json({ email, password, name: deviceName }));
  }

  getDashboard(): Promise<Dashboard> {
    return this.request<Dashboard>("/api/dashboard");
  }

  getFeedings(): Promise<Feeding[]> {
    return this.request<Feeding[]>("/api/feedings");
  }

  createFeeding(f: {
    fedAt: string;
    starterAmountG: number;
    flourAmountG: number;
    waterAmountG: number;
    notes?: string;
  }): Promise<Feeding> {
    return this.request<Feeding>("/api/feedings", this.json(f));
  }

  getBakes(): Promise<Bake[]> {
    return this.request<Bake[]>("/api/bakes");
  }

  /** Upload a recorded voice note (React Native FormData file). */
  async uploadVoice(fileUri: string, bakeId?: string): Promise<void> {
    const form = new FormData();
    form.append("audio", {
      uri: fileUri,
      name: "voice-note.m4a",
      type: "audio/m4a",
    } as unknown as Blob);
    if (bakeId) form.append("bakeId", bakeId);
    await this.request("/api/voice/upload", { method: "POST", body: form });
  }
}
