import type {
  AnalysisResult,
  AnalysisStatusResponse,
  DetectorInfo,
  HistoryItem,
  JobCreatedResponse,
  JobResponse,
} from "./types";

// API base is configurable via VITE_API_BASE; defaults to the dev proxy "/api".
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (e) {
    throw new ApiError(
      `Network error reaching API: ${(e as Error).message}`,
      0,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.message ?? JSON.stringify(body);
    } catch {
      /* non-json error body */
    }
    throw new ApiError(`${res.status}: ${detail}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface FolderPayloadFile {
  relpath: string;
  content: string;
}

export const api = {
  analyzeSnippet: (code: string, filename: string, language?: string) =>
    postJson<AnalysisResult>("/analyze-snippet", { code, filename, language }),

  analyzeFile: (filename: string, content: string, language?: string) =>
    postJson<AnalysisResult>("/analyze-file", { filename, content, language }),

  analyzeFolder: (files: Record<string, string>, name: string) =>
    postJson<AnalysisResult>("/analyze-folder", { files, name }),

  analyzeRepository: (params: {
    repository: string;
    token?: string;
    ref?: string;
    async_job?: boolean;
  }) => postJson<JobCreatedResponse>("/analyze-repository", params),

  analyzeZip: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<JobCreatedResponse>("/analyze-zip", {
      method: "POST",
      body: form,
    });
  },

  getJob: (jobId: string) => request<JobResponse>(`/jobs/${jobId}`),

  getAnalysisStatus: (id: string) =>
    request<AnalysisStatusResponse>(`/analysis/${id}`),

  getReport: (id: string) => request<AnalysisResult>(`/report/${id}`),

  getHistory: () => request<HistoryItem[]>("/history"),

  getDetectors: () =>
    request<{ detectors: DetectorInfo[] }>("/detectors").then(
      (r) => r.detectors,
    ),

  health: () => request<unknown>("/healthz"),
};

export { ApiError };
