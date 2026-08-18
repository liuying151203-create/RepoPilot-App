import { getAgentServerClientOptions } from "./agent-server-client-options";

export interface ProviderStatus {
  name: string;
  configured: boolean;
  available: boolean;
  detail: string | null;
  service_state: "unavailable" | "ready";
  repository_state:
    | "not_built"
    | "preparing"
    | "indexing"
    | "indexed"
    | "error";
  capability: IntelligenceCapability;
  selected: boolean;
  item_count: number;
  supports_visualization: boolean;
  credential_configured?: boolean;
  requires_credential?: boolean;
}

export interface RepositoryIntelligenceCredentials {
  code_search_configured: boolean;
  code_search_source: "none" | "environment" | "secure_store";
  secure_storage_available: boolean;
  secure_storage_detail: string | null;
}

export type IntelligenceLevel =
  | "repository_map"
  | "code_search"
  | "context_graph";
export type IntelligenceCapability = IntelligenceLevel;

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
  index_level: IntelligenceLevel;
  capabilities: IntelligenceCapability[];
  error: string | null;
}

export type IndexTaskState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface IndexTaskLog {
  timestamp: string;
  level: "info" | "warning" | "error";
  stage: IntelligenceCapability | null;
  progress: number;
  message: string;
}

export interface RepositoryIndexTask {
  id: string;
  repository_path: string;
  index_level: IntelligenceLevel;
  state: IndexTaskState;
  progress: number;
  stage: IntelligenceCapability | null;
  attempt: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  logs: IndexTaskLog[];
  result: RepositoryIndexStatus | null;
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
  providers_queried: string[];
  capabilities_used: IntelligenceCapability[];
  capability_contributions: Partial<Record<IntelligenceCapability, number>>;
  index_level: IntelligenceLevel;
  summary: string;
}

export interface IntelligenceGraphNode {
  id: string;
  type: string;
  caption: string;
  summary: string | null;
  properties: Record<string, unknown>;
}

export interface IntelligenceGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

export interface IntelligenceGraph {
  nodes: IntelligenceGraphNode[];
  edges: IntelligenceGraphEdge[];
  truncated: boolean;
  index_level: IntelligenceLevel;
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
  static getCredentials(): Promise<RepositoryIntelligenceCredentials> {
    return request("/api/repository-intelligence/credentials");
  }

  static setCodeSearchCredential(
    apiKey: string,
  ): Promise<RepositoryIntelligenceCredentials> {
    return request("/api/repository-intelligence/credentials/code-search", {
      method: "PUT",
      body: JSON.stringify({ api_key: apiKey }),
    });
  }

  static clearCodeSearchCredential(): Promise<RepositoryIntelligenceCredentials> {
    return request("/api/repository-intelligence/credentials/code-search", {
      method: "DELETE",
    });
  }

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

  static setLevel(
    repositoryPath: string,
    indexLevel: IntelligenceLevel,
  ): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/level", {
      method: "PUT",
      body: JSON.stringify({
        repository_path: repositoryPath,
        index_level: indexLevel,
      }),
    });
  }

  static buildIndex(
    repositoryPath: string,
    indexLevel: IntelligenceLevel,
  ): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/indexes", {
      method: "POST",
      body: JSON.stringify({
        repository_path: repositoryPath,
        index_level: indexLevel,
      }),
    });
  }

  static refreshIndex(
    repositoryPath: string,
    indexLevel: IntelligenceLevel,
  ): Promise<RepositoryIndexStatus> {
    return request("/api/repository-intelligence/indexes/refresh", {
      method: "POST",
      body: JSON.stringify({
        repository_path: repositoryPath,
        index_level: indexLevel,
      }),
    });
  }

  static startIndexTask(
    repositoryPath: string,
    indexLevel: IntelligenceLevel,
  ): Promise<RepositoryIndexTask> {
    return request("/api/repository-intelligence/index-tasks", {
      method: "POST",
      body: JSON.stringify({
        repository_path: repositoryPath,
        index_level: indexLevel,
      }),
    });
  }

  static getLatestIndexTask(
    repositoryPath: string,
  ): Promise<RepositoryIndexTask | null> {
    const params = new URLSearchParams({ repository_path: repositoryPath });
    return request(
      `/api/repository-intelligence/index-tasks/latest?${params.toString()}`,
    );
  }

  static retryIndexTask(taskId: string): Promise<RepositoryIndexTask> {
    return request(
      `/api/repository-intelligence/index-tasks/${encodeURIComponent(taskId)}/retry`,
      { method: "POST" },
    );
  }

  static cancelIndexTask(taskId: string): Promise<RepositoryIndexTask> {
    return request(
      `/api/repository-intelligence/index-tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: "POST" },
    );
  }

  static clearIndex(repositoryPath: string): Promise<RepositoryIndexStatus> {
    const params = new URLSearchParams({ repository_path: repositoryPath });
    return request(
      `/api/repository-intelligence/indexes?${params.toString()}`,
      { method: "DELETE" },
    );
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

  static getGraph(
    repositoryPath: string,
    nodeId?: string,
  ): Promise<IntelligenceGraph> {
    const endpoint = nodeId ? "graph/neighborhood" : "graph";
    const params = new URLSearchParams({ repository_path: repositoryPath });
    if (nodeId) params.set("node_id", nodeId);
    return request(
      `/api/repository-intelligence/${endpoint}?${params.toString()}`,
    );
  }
}

export default RepositoryIntelligenceService;
