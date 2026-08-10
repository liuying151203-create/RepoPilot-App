import { getAgentServerClientOptions } from "./agent-server-client-options";

export interface ProviderStatus {
  name: string;
  configured: boolean;
  available: boolean;
  detail: string | null;
}

export interface RepositoryIndexStatus {
  repository_path: string;
  repository_name: string;
  enabled: boolean;
  state: "not_indexed" | "building" | "indexed" | "error";
  file_count: number;
  symbol_count: number;
  relationship_count: number;
  graph_ready: boolean;
  updated_at: string | null;
  providers: ProviderStatus[];
  error: string | null;
}

export interface CodeSymbol {
  name: string;
  kind: string;
  path: string;
  line: number | null;
  provider: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  relation: string;
  provider: string;
}

export interface CodeMatch {
  path: string;
  line: number | null;
  symbol: string | null;
  snippet: string | null;
  score: number;
  provider: string;
}

export interface RepositoryContext {
  task: string;
  repository_path: string;
  relevant_files: string[];
  symbols: CodeSymbol[];
  relationships: DependencyEdge[];
  tests: string[];
  matches: CodeMatch[];
  providers_used: string[];
  summary: string;
}

interface ErrorPayload {
  detail?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { host, apiKey } = getAgentServerClientOptions();
  const response = await fetch(`${host}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-Session-API-Key": apiKey } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as ErrorPayload;
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

class RepositoryIntelligenceService {
  static getStatus(repositoryPath: string): Promise<RepositoryIndexStatus> {
    const params = new URLSearchParams({ repository_path: repositoryPath });
    return request(`/api/repository-intelligence/status?${params.toString()}`);
  }

  static setEnabled(
    repositoryPath: string,
    enabled: boolean,
  ): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/enabled", {
      method: "PUT",
      body: JSON.stringify({ repository_path: repositoryPath, enabled }),
    });
  }

  static buildIndex(repositoryPath: string): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/indexes", {
      method: "POST",
      body: JSON.stringify({ repository_path: repositoryPath }),
    });
  }

  static refreshIndex(repositoryPath: string): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/indexes/refresh", {
      method: "POST",
      body: JSON.stringify({ repository_path: repositoryPath }),
    });
  }

  static getContext(
    repositoryPath: string,
    task: string,
  ): Promise<RepositoryContext> {
    return request("/api/repository-intelligence/context", {
      method: "POST",
      body: JSON.stringify({
        repository_path: repositoryPath,
        task,
        limit: 20,
      }),
    });
  }
}

export default RepositoryIntelligenceService;
